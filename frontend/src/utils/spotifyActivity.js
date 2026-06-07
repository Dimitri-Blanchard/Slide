/** Total duration as m:ss (e.g. 3:24) */
export function formatSpotifyDuration(ms) {
  if (ms == null || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** Elapsed position as m:ss (e.g. 1:18) */
export function formatSpotifyElapsedSeconds(ms) {
  return formatSpotifyDuration(ms);
}

export function getSpotifyTrackKey(track) {
  if (!track) return '';
  return `${track.name}|${track.artists}|${track.duration_ms}`;
}
