import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const port = Number(process.env.PORT || 4000);
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const spotifyConfigured = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_REDIRECT_URI);
const oauthStates = new Map<string, number>();

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, callback) {
  if (!origin || clientOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS.'));
}, methods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 86400 }));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'needle-api' }));
app.get('/api/spotify/status', (_req, res) => res.json({ configured: spotifyConfigured }));

app.get('/api/spotify/login', (_req, res) => {
  if (!spotifyConfigured) return res.status(503).json({ error: 'Configura SPOTIFY_CLIENT_ID y SPOTIFY_REDIRECT_URI en el backend.' });
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  const challenge = crypto.randomBytes(32).toString('base64url');
  const verifierHash = crypto.createHash('sha256').update(challenge).digest('base64url');
  // Keep PKCE verifier on the server under a one-time OAuth state. This allows
  // the static client to receive the token without embedding a client secret.
  pkceVerifiers.set(state, { challenge, expiresAt: Date.now() + 10 * 60 * 1000 });
  const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
  authorizeUrl.search = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!, response_type: 'code', redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state, code_challenge_method: 'S256', code_challenge: verifierHash,
    scope: 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state',
    show_dialog: 'true',
  }).toString();
  res.json({ url: authorizeUrl.toString() });
});

const pkceVerifiers = new Map<string, { challenge: string; expiresAt: number }>();

app.get('/api/spotify/callback', async (req, res, next) => {
  try {
  const state = String(req.query.state || '');
  const expiresAt = oauthStates.get(state);
  oauthStates.delete(state);
  const pkce = pkceVerifiers.get(state);
  pkceVerifiers.delete(state);
  if (!expiresAt || expiresAt < Date.now()) return res.status(400).send('La sesión de Spotify expiró o no es válida. Vuelve al reproductor e inténtalo de nuevo.');
  const error = String(req.query.error || '');
  if (error) return res.status(400).send(`Spotify rechazó la autorización: ${escapeHtml(error)}. Puedes cerrar esta página.`);
  if (!pkce || pkce.expiresAt < Date.now() || typeof req.query.code !== 'string') return res.status(400).send('La sesión de Spotify no contiene una autorización válida.');
  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.SPOTIFY_CLIENT_ID!, grant_type: 'authorization_code', code: req.query.code, redirect_uri: process.env.SPOTIFY_REDIRECT_URI!, code_verifier: pkce.challenge }) });
  const tokenData = await tokenResponse.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!tokenResponse.ok || !tokenData.access_token) return res.status(502).send(`Spotify no completó la conexión: ${escapeHtml(tokenData.error_description || 'error desconocido')}.`);
  const clientUrl = new URL(clientOrigins[0] || 'http://localhost:5173');
  clientUrl.hash = new URLSearchParams({ access_token: tokenData.access_token, expires_in: String(tokenData.expires_in || 3600) }).toString();
  res.redirect(303, clientUrl.toString());
  } catch (error) { next(error); }
});

// A compact server-to-Spotify proxy keeps the client secret on the server.
app.post('/api/spotify/token', async (req, res, next) => {
  try {
    const authorization = req.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Falta el token de acceso de Spotify.' });
    const response = await fetch('https://api.spotify.com/v1/me/player', { headers: { Authorization: `Bearer ${match[1]}` } });
    if (response.status === 204) return res.json({ activeDevice: false });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) { next(error); }
});

app.get('/api/spotify/search', async (req, res, next) => {
  try {
    const authorization = req.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const query = String(req.query.q || '').trim().slice(0, 120);
    if (!match) return res.status(401).json({ error: 'Falta el token de acceso de Spotify.' });
    if (!query) return res.status(400).json({ error: 'Escribe una canción o artista para buscar.' });
    const url = new URL('https://api.spotify.com/v1/search');
    url.search = new URLSearchParams({ q: query, type: 'track', limit: '8' }).toString();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${match[1]}` } });
    const payload = await readSpotifyResponse(response);
    if (!response.ok) {
      return res.status(response.status).json({
        error: spotifyErrorMessage(payload, response.status),
        spotifyStatus: response.status,
      });
    }
    res.json(payload);
  } catch (error) { next(error); }
});

app.put('/api/spotify/player/play', async (req, res, next) => {
  try {
    const token = req.header('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1];
    const deviceId = String(req.query.device_id || '');
    const uri = String(req.body?.uri || '');
    if (!token) return res.status(401).json({ error: 'Falta el token de acceso de Spotify.' });
    if (!deviceId || !/^spotify:track:[A-Za-z0-9]+$/.test(uri)) return res.status(400).json({ error: 'Se necesita un dispositivo activo y un URI de canción válido.' });
    const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ uris: [uri] }) });
    if (response.status === 204) return res.status(204).end();
    res.status(response.status).json(await response.json().catch(() => ({})));
  } catch (error) { next(error); }
});

app.post('/api/spotify/refresh', async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refresh_token || '');
    if (!refreshToken || !spotifyConfigured) return res.status(400).json({ error: 'Falta refresh token o la app de Spotify no está configurada.' });
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: process.env.SPOTIFY_CLIENT_ID! }) });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  const status = message.includes('CORS') ? 403 : 500;
  res.status(status).json({ error: message });
});

app.listen(port, '0.0.0.0', () => console.info(`Needle API listening on port ${port}`));

/** Spotify normally responds with JSON, but some gateway/policy errors are plain text. */
async function readSpotifyResponse(response: globalThis.Response): Promise<unknown> {
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body) as unknown; }
  catch { return { error: body.slice(0, 500) }; }
}

function spotifyErrorMessage(payload: unknown, status: number): string {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const nested = value.error && typeof value.error === 'object' ? value.error as Record<string, unknown> : {};
  const message = [value.error_description, nested.message, typeof value.error === 'string' ? value.error : undefined]
    .find((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()));
  if (status === 401) return 'La sesión de Spotify expiró. Desconecta y vuelve a conectar tu cuenta.';
  if (status === 403) return message
    ? `Spotify rechazó la búsqueda (403): ${message}`
    : 'Spotify rechazó la búsqueda (403). Revisa que la cuenta conectada tenga acceso y que la aplicación permita este usuario.';
  if (status === 429) return 'Spotify limitó temporalmente las búsquedas. Espera un momento e inténtalo de nuevo.';
  return message ? `Spotify no pudo buscar (${status}): ${message}` : `Spotify no pudo completar la búsqueda (HTTP ${status}).`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
