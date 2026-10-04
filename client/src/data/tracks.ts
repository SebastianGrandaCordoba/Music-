import type { Track } from '../types';

export const seedTracks: Track[] = [
  { id: 't01', title: 'Luz de tarde', artist: 'Needle Studio · Demo', album: 'Sesión de muestra', duration: 18, cover: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85', accent: '#ef9c60', previewUrl: '/audio/needle-demo-01.wav' },
  { id: 't02', title: 'Pulso índigo', artist: 'Needle Studio · Demo', album: 'Sesión de muestra', duration: 18, cover: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85', accent: '#819ecf', previewUrl: '/audio/needle-demo-02.wav' },
  { id: 't03', title: 'Aire de montaña', artist: 'Needle Studio · Demo', album: 'Sesión de muestra', duration: 18, cover: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=85', accent: '#90aa88', previewUrl: '/audio/needle-demo-03.wav' },
  { id: 't04', title: 'Islas de cobre', artist: 'Needle Studio · Demo', album: 'Sesión de muestra', duration: 18, cover: 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=900&q=85', accent: '#d99170', previewUrl: '/audio/needle-demo-04.wav' },
  { id: 't05', title: 'Noche serena', artist: 'Needle Studio · Demo', album: 'Sesión de muestra', duration: 18, cover: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85', accent: '#9587bd', previewUrl: '/audio/needle-demo-05.wav' },
  { id: 't06', title: 'Horizonte abierto', artist: 'Needle Studio · Demo', album: 'Sesión de muestra', duration: 18, cover: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=85', accent: '#80aaa5', previewUrl: '/audio/needle-demo-06.wav' },
  { id: 't07', title: 'Sin prisa', artist: 'Needle Studio · Demo', album: 'Sesión de muestra', duration: 18, cover: 'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&w=900&q=85', accent: '#d08f70', previewUrl: '/audio/needle-demo-07.wav' },
];

export function makeTrack(title: string, artist: string, cover?: string): Track {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `track-${Date.now()}`,
    title: title.trim(), artist: artist.trim() || 'Artista desconocido', album: 'Tu colección', duration: 210,
    cover: cover?.trim() || `https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85`, accent: '#aa7e58',
  };
}
