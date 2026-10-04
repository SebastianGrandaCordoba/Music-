import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, AudioLines, Disc3, ExternalLink, Heart, ListMusic, LoaderCircle, MoreHorizontal, Music2, Pause, Play, Plus, Repeat2, Search, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { DoublyLinkedList } from './structures/DoublyLinkedList';
import { makeTrack, seedTracks } from './data/tracks';
import type { Track } from './types';

type SpotifyPlaybackState = { paused: boolean; position: number; duration: number; track_window?: { current_track?: { uri?: string } } };
type SpotifySdkPlayer = {
  addListener: (event: string, callback: (payload: { device_id?: string; message?: string } | SpotifyPlaybackState) => void) => boolean;
  connect: () => Promise<boolean>; disconnect: () => void; pause: () => Promise<void>; resume: () => Promise<void>;
  activateElement: () => Promise<void>; togglePlay: () => Promise<void>; setVolume: (volume: number) => Promise<void>; seek: (position: number) => Promise<void>;
};
declare global { interface Window { Spotify?: { Player: new (options: { name: string; getOAuthToken: (callback: (token: string) => void) => void; volume: number }) => SpotifySdkPlayer }; onSpotifyWebPlaybackSDKReady?: () => void } }

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const art = (id: string, size = 120) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${size}&q=80`;
const fmt = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

function Cover({ track, className = '' }: { track: Track; className?: string }) {
  return <img className={`cover ${className}`} src={track.cover} alt={`Portada de ${track.album}`} />;
}

function App() {
  const queueRef = useRef(new DoublyLinkedList<Track>());
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [liked, setLiked] = useState(false);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [activeTab, setActiveTab] = useState<'Queue' | 'Discover'>('Queue');
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState<SpotifySdkPlayer | null>(null);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [spotifySdkReady, setSpotifySdkReady] = useState(false);
  const [provider, setProvider] = useState<'preview' | 'spotify'>('preview');
  const [spotifySearch, setSpotifySearch] = useState('');
  const [spotifyResults, setSpotifyResults] = useState<Array<{ id: string; name: string; uri: string; artists: Array<{ name: string }>; album: { name: string; images?: Array<{ url: string }> }; duration_ms: number; preview_url?: string | null }>>([]);
  const [searchingSpotify, setSearchingSpotify] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const notify = useCallback((message: string, isError = false) => {
    setToast(message); setToastError(isError);
    window.setTimeout(() => setToast(''), 2800);
  }, []);

  const sync = useCallback(() => {
    const list = queueRef.current;
    setTracks(list.toArray());
    setCurrent(list.current?.value ?? null);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('needle-queue-v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Track[];
        parsed.forEach((track) => queueRef.current.addLast(track));
        if (parsed.length) { sync(); return; }
      } catch { localStorage.removeItem('needle-queue-v1'); }
    }
    seedTracks.forEach((track) => queueRef.current.addLast(track));
    sync();
  }, [sync]);

  useEffect(() => {
    if (tracks.length) localStorage.setItem('needle-queue-v1', JSON.stringify(tracks));
    else localStorage.removeItem('needle-queue-v1');
  }, [tracks]);

  useEffect(() => {
    fetch(`${apiBase}/api/spotify/status`).then((response) => response.json())
      .then((data: { configured?: boolean }) => setSpotifyReady(Boolean(data.configured))).catch(() => setSpotifyReady(false));
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get('access_token');
    if (accessToken) {
      setToken(accessToken); setTokenExpiry(Date.now() + Number(fragment.get('expires_in') || 3600) * 1000); window.history.replaceState({}, '', window.location.pathname);
      notify('Spotify conectado. Busca una pista para reproducirla completa.');
    }
  }, [notify]);

  useEffect(() => {
    if (!token || !tokenExpiry) return;
    const timer = window.setTimeout(() => { setToken(null); notify('La sesión de Spotify expiró. Vuelve a conectar tu cuenta.', true); }, Math.max(0, tokenExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [token, tokenExpiry, notify]);

  useEffect(() => {
    if (!token) { spotifyPlayer?.disconnect(); setSpotifyPlayer(null); setSpotifyDeviceId(null); setSpotifySdkReady(false); return; }
    let cancelled = false;
    const initialize = () => {
      if (cancelled || !window.Spotify) return;
      const player = new window.Spotify.Player({ name: 'Needle Web Player', getOAuthToken: (callback) => callback(token), volume });
      player.addListener('ready', (payload) => {
        const deviceId = (payload as { device_id?: string }).device_id;
        if (deviceId) { setSpotifyDeviceId(deviceId); setSpotifySdkReady(true); notify('Spotify Web Player listo.'); }
      });
      player.addListener('not_ready', () => { setSpotifySdkReady(false); setSpotifyDeviceId(null); });
      player.addListener('initialization_error', (payload) => notify(`SDK Spotify: ${(payload as { message?: string }).message || 'error de inicialización'}`, true));
      player.addListener('authentication_error', () => { setToken(null); notify('Spotify rechazó el token. Conecta la cuenta de nuevo.', true); });
      player.addListener('account_error', () => notify('Web Playback SDK requiere una cuenta Premium elegible.', true));
      player.addListener('playback_error', (payload) => notify(`Spotify no pudo reproducir esta pista: ${(payload as { message?: string }).message || 'error de reproducción'}`, true));
      player.addListener('player_state_changed', (payload) => {
        const state = payload as SpotifyPlaybackState;
        if (!state || typeof state.paused !== 'boolean') return;
        setPosition(state.position / 1000); setDuration(state.duration / 1000); setPlaying(!state.paused);
        const uri = state.track_window?.current_track?.uri;
        if (uri) {
          const match = queueRef.current.toArray().find((track) => track.spotifyUri === uri);
          if (match && queueRef.current.current?.value.id !== match.id) { queueRef.current.setCurrentById(match.id); sync(); }
        }
      });
      setSpotifyPlayer(player);
      void player.connect().then((connected) => { if (!connected) notify('No se pudo conectar el Web Playback SDK.', true); });
    };
    if (window.Spotify) initialize();
    else {
      window.onSpotifyWebPlaybackSDKReady = initialize;
      if (!document.querySelector('script[data-spotify-sdk]')) {
        const script = document.createElement('script'); script.src = 'https://sdk.scdn.co/spotify-player.js'; script.async = true; script.dataset.spotifySdk = 'true';
        script.onerror = () => notify('No se pudo cargar el SDK de Spotify. Revisa tu conexión.', true); document.body.appendChild(script);
      }
    }
    return () => { cancelled = true; spotifyPlayer?.disconnect(); };
  // Initialize one SDK player per access-token session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!current) return;
    const audio = audioRef.current;
    setPosition(0); setDuration(current.duration); setLiked(false);
    if (current.spotifyUri && token && spotifyPlayer && spotifyDeviceId) {
      setProvider('spotify'); audio?.pause();
      void spotifyPlayer.activateElement().then(() => fetch(`${apiBase}/api/spotify/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ uri: current.spotifyUri }) })).then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error || `Spotify respondió ${response.status}.`);
        setPlaying(true);
      }).catch((error: unknown) => {
        if (current.previewUrl && audio) { setProvider('preview'); audio.src = current.previewUrl; audio.load(); setPlaying(true); notify('Spotify no reprodujo la pista; usando su preview.'); }
        else { setPlaying(false); notify(error instanceof Error ? error.message : 'No se pudo reproducir en Spotify.', true); }
      });
    } else if (current.spotifyUri && token && !spotifySdkReady) {
      setProvider('spotify'); setPlaying(false);
    } else if (current.previewUrl && audio) {
      void spotifyPlayer?.pause().catch(() => undefined);
      setProvider('preview'); audio.src = current.previewUrl; audio.load();
      if (playing) void audio.play().catch(() => setPlaying(false));
    } else {
      setProvider('preview');
      if (playing) notify('Sin audio disponible para esta pista. Añade un preview o carga audio local.', true);
      setPlaying(false);
    }
  }, [current?.id, token, spotifyPlayer, spotifyDeviceId, spotifySdkReady]);

  useEffect(() => {
    const audio = audioRef.current;
    if (provider === 'spotify' && spotifyPlayer) {
      spotifyPlayer.setVolume(muted ? 0 : volume).catch(() => undefined);
      if (playing) void spotifyPlayer.resume().catch(() => undefined); else void spotifyPlayer.pause().catch(() => undefined);
      return;
    }
    if (!audio || provider !== 'preview') return;
    audio.volume = muted ? 0 : volume;
    if (!current?.previewUrl) return;
    if (playing) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [playing, volume, muted, provider, current?.id, spotifyPlayer]);

  const move = useCallback((direction: 'next' | 'previous', automatic = false) => {
    const list = queueRef.current;
    if (!list.size) return;
    if (shuffle && direction === 'next' && list.size > 1) {
      let next = list.current;
      while (next === list.current) next = list.nodeAt(Math.floor(Math.random() * list.size));
      list.current = next;
    } else {
      const node = direction === 'next' ? list.moveNext(loop || automatic) : list.movePrevious(loop);
      if (!node && direction === 'next') { setPlaying(false); setPosition(0); sync(); return; }
    }
    sync(); setPosition(0); setPlaying(true);
  }, [loop, shuffle, sync]);

  const playTrack = useCallback((id: string) => {
    if (queueRef.current.setCurrentById(id)) { sync(); setPosition(0); setPlaying(true); }
  }, [sync]);

  const removeTrack = useCallback((id: string) => {
    const wasCurrent = queueRef.current.current?.value.id === id;
    const nextTrack = queueRef.current.nodeAt(queueRef.current.indexOfId(id) + 1)?.value;
    queueRef.current.removeById(id); sync();
    if (wasCurrent) { setPosition(0); setPlaying(false); if (nextTrack) window.setTimeout(() => setPlaying(true), 0); }
    notify('Pista eliminada de la cola.');
  }, [notify, sync]);

  const addTrack = useCallback((track: Track, where: 'start' | 'end' | number = 'end') => {
    const list = queueRef.current;
    if (list.toArray().some((item) => item.id === track.id)) { notify('Esa pista ya está en la cola.', true); return; }
    if (where === 'start') list.addFirst(track);
    else if (where === 'end') list.addLast(track);
    else list.insertAt(track, where);
    sync(); notify(`“${track.title}” añadida a la cola.`);
  }, [notify, sync]);

  const moveToIndex = useCallback((id: string, target: number) => {
    const list = queueRef.current;
    const source = list.indexOfId(id);
    if (source < 0 || target < 0 || target >= list.size || source === target) return;
    const item = list.removeAt(source)!;
    list.insertAt(item, target);
    sync();
  }, [sync]);

  const clearQueue = () => {
    queueRef.current.clear(); setTracks([]); setCurrent(null); setPlaying(false); setPosition(0); notify('Cola vaciada.');
  };

  const togglePlay = () => {
    if (!current && tracks.length) { queueRef.current.current = queueRef.current.head; sync(); }
    if (!current && !tracks.length) return;
    if (provider === 'spotify' && spotifyPlayer) { void spotifyPlayer.togglePlay().catch(() => undefined); return; }
    setPlaying((value) => !value);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
      else if (event.key.toLowerCase() === 'j') move('previous');
      else if (event.key.toLowerCase() === 'k') move('next');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, move]);

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) { setPosition(audio.currentTime); if (audio.duration) setDuration(audio.duration); }
  };

  const handleEnded = () => {
    if (loop && audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play(); }
    else move('next', true);
  };

  const filteredTracks = useMemo(() => tracks.filter((track) => `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query.toLowerCase())), [tracks, query]);
  const visualPosition = duration ? Math.min(100, position / duration * 100) : 0;

  const connectSpotify = async () => {
    try {
      const response = await fetch(`${apiBase}/api/spotify/login`);
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || 'No se pudo iniciar sesión.');
      window.location.assign(data.url);
    } catch (error) { notify(error instanceof Error ? error.message : 'Error de conexión con Spotify.', true); }
  };

  const searchSpotify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !spotifySearch.trim()) return;
    setSearchingSpotify(true);
    try {
      const response = await fetch(`${apiBase}/api/spotify/search?q=${encodeURIComponent(spotifySearch.trim())}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json() as { tracks?: { items?: typeof spotifyResults }; error?: string };
      if (!response.ok) throw new Error(data.error || 'Spotify no pudo completar la búsqueda.');
      setSpotifyResults(data.tracks?.items ?? []);
      if (!data.tracks?.items?.length) notify('No se encontraron pistas para esa búsqueda.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Error buscando en Spotify.', true); }
    finally { setSearchingSpotify(false); }
  };

  const addSpotifyTrack = (result: typeof spotifyResults[number]) => {
    const track: Track = { id: `spotify-${result.id}`, title: result.name, artist: result.artists.map((artist) => artist.name).join(', '), album: result.album.name, duration: Math.floor(result.duration_ms / 1000), cover: result.album.images?.[0]?.url ?? art('photo-1519681393784-d120267933ba', 900), accent: '#878761', previewUrl: result.preview_url ?? undefined, spotifyUri: result.uri };
    addTrack(track); setModalOpen(false);
    if (!result.preview_url) notify('Spotify no entregó preview para esta pista; añádela y usa un archivo local mientras conectamos Playback SDK.', true);
  };

  const addLocalFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).filter((file) => file.type.startsWith('audio/')).forEach((file) => {
      const track: Track = { id: `local-${Date.now()}-${file.name}`, title: file.name.replace(/\.[^.]+$/, ''), artist: 'Archivo local', album: 'En este dispositivo', duration: 0, cover: art('photo-1519681393784-d120267933ba', 900), accent: '#aa7e58', previewUrl: URL.createObjectURL(file) };
      addTrack(track);
    });
    if (files.length) setModalOpen(false);
  };

  return (
    <div className="app-shell" style={{ '--current-accent': current?.accent ?? '#b05f40' } as React.CSSProperties}>
      <audio ref={audioRef} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onTimeUpdate} onEnded={handleEnded} onError={() => { if (current?.previewUrl && provider === 'preview') { setPlaying(false); notify('No se pudo cargar el preview. Puedes conectar Spotify o elegir otra pista.', true); } }} />
      <aside className="rail">
        <a className="brand-mark" href="#top" aria-label="Needle inicio"><span className="brand-pin" /><span className="brand-word">needle<span>.</span></span></a>
        <div className="rail-caption">TU ESPACIO</div>
        <button className="rail-link active"><Disc3 size={18} /><span>Reproductor</span></button>
        <button className="rail-link" onClick={() => setActiveTab('Queue')}><ListMusic size={18} /><span>Tu cola</span><small>{tracks.length}</small></button>
        <button className="rail-link" onClick={() => setModalOpen(true)}><Plus size={18} /><span>Añadir música</span></button>
        <div className="rail-divider" />
        <div className="rail-caption">MODO</div>
        <button className={`rail-link ${shuffle ? 'toggled' : ''}`} onClick={() => setShuffle((v) => !v)}><Shuffle size={18} /><span>Aleatorio</span></button>
        <button className={`rail-link ${loop ? 'toggled' : ''}`} onClick={() => setLoop((v) => !v)}><Repeat2 size={18} /><span>Repetir pista</span></button>
        <div className="rail-bottom"><div className="rail-status"><span className="status-dot" />{token ? 'Spotify conectado' : 'Modo vista previa'}</div><div className="rail-version">LISTA DOBLE · TYPESCRIPT</div></div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar"><div className="breadcrumb">TU COLECCIÓN <span>/</span> AHORA SUENA</div><div className="topbar-right"><span className="date-stamp">VOL. 001 <i /> OCT 2026</span><button className="avatar" title="Perfil local">M</button></div></header>
        <div className="page-grid">
          <section className="primary-column">
            <div className="intro-row"><div><div className="eyebrow"><span className="live-dot" /> THE LISTENING ROOM</div><h1>Deja que<br />la música <em>fluya.</em></h1><p className="intro-copy">Tu espacio para escuchar sin prisa.<br />Cada canción, conectada a la siguiente.</p></div><div className="intro-sticker"><AudioLines size={24} strokeWidth={1.4} /><span>HECHO PARA<br />ESCUCHAR</span><small>↘</small></div></div>

            <section className="now-card" aria-label="Reproductor actual">
              <div className="now-card-top"><span>EN REPRODUCCIÓN <span className="tiny-wave">▂ ▅ ▃</span></span><button className={`icon-button like-button ${liked ? 'liked' : ''}`} onClick={() => setLiked((v) => !v)} aria-label="Me gusta"><Heart size={17} fill={liked ? 'currentColor' : 'none'} /></button></div>
              <div className="now-card-body">
                <div className="hero-art-wrap"><div className={`hero-art ${playing ? 'art-playing' : ''}`}>{current ? <Cover track={current} /> : <Disc3 size={80} strokeWidth={0.7} />}</div><div className="art-index">{String(Math.max(1, tracks.findIndex((t) => t.id === current?.id) + 1)).padStart(2, '0')} <span>/ {String(tracks.length).padStart(2, '0')}</span></div></div>
                <div className="now-meta"><div className="eyebrow muted">{current ? 'SELECCIÓN ACTUAL' : 'LISTA VACÍA'}</div><h2>{current?.title ?? 'Elige una canción'}</h2><p>{current?.artist ?? 'Añade música para comenzar'}</p><div className="track-tags"><span><span className="tag-dot" /> {current?.album ?? '—'}</span><span>{current ? fmt(current.duration) : '00:00'}</span></div></div>
              </div>
              <div className="player-progress"><span>{fmt(position)}</span><button className="progress-track" aria-label="Buscar posición" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const next = ((event.clientX - rect.left) / rect.width) * (duration || 0); setPosition(next); if (provider === 'preview' && audioRef.current) audioRef.current.currentTime = next; else if (provider === 'spotify') void spotifyPlayer?.seek(next * 1000); }}><span style={{ width: `${visualPosition}%` }} /><i style={{ left: `${visualPosition}%` }} /></button><span>{fmt(duration || current?.duration || 0)}</span></div>
              <div className="player-controls"><button className={`control-sub ${shuffle ? 'enabled' : ''}`} onClick={() => setShuffle((v) => !v)} aria-label="Aleatorio"><Shuffle size={17} /></button><div className="transport"><button className="skip-button" onClick={() => { if (position > 3 && audioRef.current && provider === 'preview') { audioRef.current.currentTime = 0; setPosition(0); } else move('previous'); }} aria-label="Anterior"><SkipBack size={20} fill="currentColor" /></button><button className="play-button" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button><button className="skip-button" onClick={() => move('next')} aria-label="Siguiente"><SkipForward size={20} fill="currentColor" /></button></div><button className={`control-sub ${loop ? 'enabled' : ''}`} onClick={() => setLoop((v) => !v)} aria-label="Repetir"><Repeat2 size={17} /></button></div>
              <div className="now-card-footer"><span><span className="quality-dot" /> {token ? 'SPOTIFY CONNECT' : 'LOCAL PREVIEW'}</span><span>{playing ? <><span className="sound-bars"><i /><i /><i /></span> REPRODUCIENDO</> : 'LISTO PARA SONAR'}</span></div>
            </section>

            <section className="queue-section">
              <div className="section-heading"><div><span className="section-kicker">EL ORDEN DE LAS COSAS</span><h2>Tu fila <span className="count-badge">{tracks.length.toString().padStart(2, '0')}</span></h2></div><div className="queue-actions"><button className="quiet-button" onClick={() => fileRef.current?.click()}><Plus size={15} /> Añadir</button><button className="text-button" onClick={clearQueue} disabled={!tracks.length}>Vaciar cola</button></div></div>
              <div className="list-head"><span>PISTA</span><span>ÁLBUM</span><span>ENLACES</span><span>TIEMPO</span><span /></div>
              <div className="track-list">
                {filteredTracks.map((track) => {
                  const index = tracks.findIndex((item) => item.id === track.id);
                  const isCurrent = current?.id === track.id;
                  return <article key={track.id} className={`track-row ${isCurrent ? 'current-row' : ''} ${dragId === track.id ? 'dragging' : ''}`} draggable onDragStart={() => setDragId(track.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragId) moveToIndex(dragId, index); setDragId(null); }} onDragEnd={() => setDragId(null)}>
                    <button className="track-main" onClick={() => playTrack(track.id)}><span className="row-number">{isCurrent && playing ? <span className="sound-bars active-bars"><i /><i /><i /></span> : String(index + 1).padStart(2, '0')}</span><Cover track={track} className="row-cover" /><span className="track-text"><strong>{track.title}</strong><small>{track.artist}</small></span></button>
                    <span className="album-name">{track.album}</span><span className="node-links"><span className="link-pill">← {tracks[index - 1]?.title ?? '∅'}</span><span className="link-arrow">↔</span><span className="link-pill">{tracks[index + 1]?.title ?? '∅'} →</span></span>
                    <span className="row-duration">{fmt(track.duration)}</span><div className="row-tools"><button title="Subir en la cola" onClick={() => moveToIndex(track.id, Math.max(0, index - 1))}><ArrowUp size={14} /></button><button title="Bajar en la cola" onClick={() => moveToIndex(track.id, Math.min(tracks.length - 1, index + 1))}><ArrowDown size={14} /></button><button className="remove-button" title="Eliminar canción" onClick={() => removeTrack(track.id)}><Trash2 size={14} /></button></div>
                  </article>;
                })}
                {!filteredTracks.length && <div className="empty-state"><Music2 size={22} /><span>{tracks.length ? 'No hay coincidencias.' : 'La cola está vacía. Añade una canción para empezar.'}</span><button onClick={() => setModalOpen(true)}>Explorar música <ArrowRight size={15} /></button></div>}
              </div>
              {tracks.length > 0 && <div className="queue-footnote"><span>⠿ &nbsp;Arrastra una pista para reordenar</span><span>LISTA DOBLEMENTE ENLAZADA <b>·</b> HEAD ⇄ TAIL</span></div>}
            </section>

            <section className="structure-card"><div className="structure-copy"><span className="section-kicker">POR DEBAJO DEL CAPÓ</span><h3>Una lista que se mueve<br />en <em>dos direcciones.</em></h3><p>Cada canción es un nodo con memoria: conoce a quien viene antes y a quien sigue después.</p></div><div className="structure-diagram"><span className="node-label">HEAD</span>{tracks.slice(0, Math.min(4, tracks.length)).map((track, index) => <div key={track.id} className={`diagram-node ${current?.id === track.id ? 'node-active' : ''}`}><span className="node-pointer">{index ? '←' : '∅'}</span><button onClick={() => playTrack(track.id)} title={`Reproducir ${track.title}`}><span>{track.title.slice(0, 2).toUpperCase()}</span></button><span className="node-pointer">→</span></div>)}<span className="node-label">TAIL</span></div><div className="structure-legend"><span><i className="legend-prev" /> prev</span><span><i className="legend-next" /> next</span><span><i className="legend-current" /> cursor actual</span></div></section>
          </section>

          <aside className="side-column">
            <section className="side-card side-tools"><div className="side-card-head"><span>HERRAMIENTAS</span><MoreHorizontal size={18} /></div><button className="tool-search"><Search size={16} /><input placeholder="Buscar en la cola..." value={query} onChange={(event) => setQuery(event.target.value)} /><span>⌘ K</span></button><div className="tool-stats"><div><span>EN LA COLA</span><strong>{tracks.length.toString().padStart(2, '0')}</strong></div><i /><div><span>DURACIÓN TOTAL</span><strong>{fmt(tracks.reduce((acc, track) => acc + track.duration, 0))}</strong></div></div><div className="side-card-foot"><span>ESTADO DE NODOS</span><span className="synced"><i /> SINCRONIZADO</span></div></section>
            <section className="side-card discovery-card"><div className="side-card-head"><span>PARA DESCUBRIR</span><Sparkles size={16} /></div><div className="tab-switch"><button className={activeTab === 'Queue' ? 'selected' : ''} onClick={() => setActiveTab('Queue')}>Tu selección</button><button className={activeTab === 'Discover' ? 'selected' : ''} onClick={() => setActiveTab('Discover')}>Ideas para hoy</button></div>{(activeTab === 'Discover' ? seedTracks.filter((track) => !tracks.some((item) => item.id === track.id)).slice(0, 4) : tracks.slice(0, 4)).map((track) => <div className="suggestion" key={track.id}><Cover track={track} className="suggestion-cover" /><div><strong>{track.title}</strong><small>{track.artist}</small></div><button onClick={() => tracks.some((item) => item.id === track.id) ? playTrack(track.id) : addTrack(track)} title="Reproducir o añadir"><Plus size={16} /></button></div>)}{activeTab === 'Discover' && !seedTracks.some((track) => !tracks.some((item) => item.id === track.id)) && <p className="all-added">Ya añadiste todas las sugerencias.</p>}<button className="discover-link" onClick={() => setActiveTab(activeTab === 'Queue' ? 'Discover' : 'Queue')}>{activeTab === 'Queue' ? 'Explorar sugerencias' : 'Volver a tu selección'} <ArrowRight size={15} /></button></section>
            <section className="spotify-card"><div className="spotify-orbit"><AudioLines size={23} /></div><span className="section-kicker">INTEGRACIÓN OPCIONAL</span><h3>Busca en<br /><em>Spotify.</em></h3><p>Conecta una cuenta Premium para consultar el catálogo. La reproducción completa requiere Web Playback SDK.</p><button onClick={token ? () => setModalOpen(true) : connectSpotify} disabled={!spotifyReady}>{spotifyReady ? token ? <><Search size={15} /> Buscar canciones</> : <>Conectar con Spotify <ExternalLink size={14} /></> : <><LoaderCircle size={15} /> Preparar conexión</>}</button><span className="spotify-note">{spotifyReady ? token ? 'OAUTH 2.0 · CATÁLOGO' : 'CONFIGURA TU APP EN .ENV' : 'CONFIGURA TUS CREDENCIALES EN .ENV'}</span></section>
            <section className="tip-card"><span>✳</span><div><b>PISTA RÁPIDA</b><p>Usa <kbd>J</kbd> / <kbd>K</kbd> para ir a la anterior o siguiente pista.</p></div></section>
          </aside>
        </div>
        <footer className="page-footer"><span>NEEDLE MUSIC PLAYER <span>©</span> 2026</span><span>HECHO PARA ESCUCHAR CON ATENCIÓN <AudioLines size={14} /></span><span>v1.0.0</span></footer>
      </main>

      <footer className="bottom-player"><div className="bottom-track">{current ? <Cover track={current} className="bottom-cover" /> : <div className="bottom-cover empty-cover"><Disc3 size={20} /></div>}<div><strong>{current?.title ?? 'Nada suena todavía'}</strong><small>{current?.artist ?? 'Añade una canción para comenzar'}</small></div><button className={liked ? 'liked' : ''} onClick={() => setLiked((v) => !v)} aria-label="Me gusta"><Heart size={16} fill={liked ? 'currentColor' : 'none'} /></button></div><div className="bottom-center"><div className="bottom-controls"><button className={shuffle ? 'enabled' : ''} onClick={() => setShuffle((v) => !v)} aria-label="Aleatorio"><Shuffle size={15} /></button><button onClick={() => move('previous')} aria-label="Anterior"><SkipBack size={16} fill="currentColor" /></button><button className="mini-play" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><button onClick={() => move('next')} aria-label="Siguiente"><SkipForward size={16} fill="currentColor" /></button><button className={loop ? 'enabled' : ''} onClick={() => setLoop((v) => !v)} aria-label="Repetir"><Repeat2 size={15} /></button></div><div className="bottom-seek"><span>{fmt(position)}</span><button className="progress-track" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const next = ((event.clientX - rect.left) / rect.width) * duration; if (provider === 'preview' && audioRef.current) audioRef.current.currentTime = next; else if (provider === 'spotify') void spotifyPlayer?.seek(next * 1000); setPosition(next); }}><span style={{ width: `${visualPosition}%` }} /></button><span>{fmt(duration || current?.duration || 0)}</span></div></div><div className="bottom-right"><button onClick={() => setModalOpen(true)} title="Añadir a la cola"><ListMusic size={17} /></button><button onClick={() => setMuted((v) => !v)} aria-label="Silenciar"><AudioLines size={17} /></button><input aria-label="Volumen" type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={(event) => { setVolume(Number(event.target.value)); setMuted(false); }} /><button title="Ajustes" onClick={() => notify('Los ajustes de audio están listos para ampliarse.')}><SlidersHorizontal size={17} /></button></div></footer>

      <input ref={fileRef} className="hidden-input" type="file" accept="audio/*" multiple onChange={(event) => addLocalFiles(event.target.files)} />
      {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="section-kicker">AMPLÍA TU SELECCIÓN</span><h2 id="modal-title">Añadir música</h2></div><button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Cerrar"><X size={19} /></button></div><p className="modal-copy">Elige una forma de llevar música a tu fila.</p><button className="modal-option" onClick={() => { setModalOpen(false); setActiveTab('Discover'); }}><div className="option-icon"><Sparkles size={18} /></div><span><b>Explorar sugerencias</b><small>Descubre pistas seleccionadas para ti</small></span><ArrowRight size={17} /></button><button className="modal-option" onClick={() => fileRef.current?.click()}><div className="option-icon"><Music2 size={18} /></div><span><b>Subir audio local</b><small>Reproduce archivos de este dispositivo</small></span><ArrowRight size={17} /></button>{token && <><div className="modal-divider"><span>CATÁLOGO DE SPOTIFY</span></div><form className="spotify-search-form" onSubmit={searchSpotify}><input aria-label="Buscar en Spotify" value={spotifySearch} onChange={(event) => setSpotifySearch(event.target.value)} placeholder="Busca una canción o artista..." /><button type="submit" disabled={searchingSpotify}>{searchingSpotify ? <LoaderCircle size={15} className="spinning" /> : <Search size={15} />}</button></form>{spotifyResults.map((result) => <div className="spotify-result" key={result.id}><img src={result.album.images?.[2]?.url ?? result.album.images?.[0]?.url ?? art('photo-1519681393784-d120267933ba', 100)} alt="" /><span><b>{result.name}</b><small>{result.artists.map((artist) => artist.name).join(', ')}{result.preview_url ? ' · preview' : ''}</small></span><button onClick={() => addSpotifyTrack(result)} aria-label={`Añadir ${result.name}`}><Plus size={15} /></button></div>)}<p className="spotify-legal">Las vistas previas dependen de lo que entregue Spotify. Las pistas sin preview aparecen en tu cola, pero requieren integrar Web Playback SDK para reproducirse completas.</p></>}<div className="modal-divider"><span>O CREA UNA PISTA</span></div><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get('title') || ''); if (!title.trim()) return; const track = makeTrack(title, String(form.get('artist') || ''), String(form.get('cover') || '')); const indexValue = String(form.get('position') || 'end'); addTrack(track, indexValue === 'start' || indexValue === 'end' ? indexValue : Math.min(Number(indexValue), queueRef.current.size)); event.currentTarget.reset(); setModalOpen(false); }}><label>TÍTULO<input name="title" required placeholder="¿Cómo se llama la canción?" /></label><label>ARTISTA<input name="artist" placeholder="Nombre del artista" /></label><label>URL DE PORTADA <span>OPCIONAL</span><input name="cover" type="url" placeholder="https://..." /></label><label>POSICIÓN EN LA LISTA<select name="position"><option value="end">Al final de la lista</option><option value="start">Al inicio de la lista</option>{tracks.map((track, index) => <option value={index} key={track.id}>En la posición {index + 1} — antes de {track.title}</option>)}</select></label><button className="modal-submit" type="submit">Añadir a la cola <Plus size={16} /></button></form></section></div>}
      {toast && <div className={`toast ${toastError ? 'toast-error' : ''}`}><span>{toastError ? '!' : '✓'}</span>{toast}</div>}
      <div className="keyboard-only" aria-live="polite">{current ? `Reproduciendo ${current.title}` : 'Cola vacía'}</div>
    </div>
  );
}

export default App;
