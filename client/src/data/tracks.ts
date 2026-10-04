import type { Track } from '../types';

export const seedTracks: Track[] = [
  { id: 't01', title: 'Sunset Lover', artist: 'Petit Biscuit', album: 'Presence', duration: 216, cover: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85', accent: '#ef9c60', previewUrl: 'https://p.scdn.co/mp3-preview/c0376ac65cbdcd20249fd3ec872fb85a2946f933?cid=0caaf8dbbcfa4ccbacb8dcc3575b01c3' },
  { id: 't02', title: 'Tadow', artist: 'Masego, FKJ', album: 'Lady Lady', duration: 312, cover: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85', accent: '#819ecf', previewUrl: 'https://p.scdn.co/mp3-preview/4e4bc47d26eb9f5753d12e3ce04f5010aa94b5f1?cid=0caaf8dbbcfa4ccbacb8dcc3575b01c3' },
  { id: 't03', title: 'A Walk', artist: 'Tycho', album: 'Dive', duration: 315, cover: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=85', accent: '#90aa88', previewUrl: 'https://p.scdn.co/mp3-preview/0c46a06a78792c9479a65d0cbb2cb66dfb502931?cid=0caaf8dbbcfa4ccbacb8dcc3575b01c3' },
  { id: 't04', title: 'Kerala', artist: 'Bonobo', album: 'Migration', duration: 211, cover: 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=900&q=85', accent: '#d99170', previewUrl: 'https://p.scdn.co/mp3-preview/18d1d64aa611b3e4b7a401f6f8fb85a2946f933?cid=0caaf8dbbcfa4ccbacb8dcc3575b01c3' },
  { id: 't05', title: 'Open Eye Signal', artist: 'Jon Hopkins', album: 'Immunity', duration: 480, cover: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85', accent: '#9587bd' },
  { id: 't06', title: 'Weightless', artist: 'Marconi Union', album: 'Weightless', duration: 508, cover: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=85', accent: '#80aaa5' },
  { id: 't07', title: 'Innerbloom', artist: 'RÜFÜS DU SOL', album: 'Bloom', duration: 570, cover: 'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&w=900&q=85', accent: '#d08f70' },
];

export function makeTrack(title: string, artist: string, cover?: string): Track {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `track-${Date.now()}`,
    title: title.trim(), artist: artist.trim() || 'Artista desconocido', album: 'Tu colección', duration: 210,
    cover: cover?.trim() || `https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85`, accent: '#aa7e58',
  };
}
