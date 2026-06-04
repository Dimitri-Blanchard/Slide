/** Stable index from channel id/name — same channel always gets the same hint. */
export function stableChannelHintIndex(seed, count) {
  if (!count || count < 1) return 0;
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % count);
}

export function formatChannelWelcomeHint(template, channelTag) {
  if (!template) return '';
  return String(template).replace(/\{channel\}/g, channelTag);
}

export function pickChannelWelcomeHint(hints, channelId, channelName, channelTag) {
  const list = Array.isArray(hints) && hints.length > 0 ? hints : null;
  if (!list) return '';
  const seed = channelId != null ? String(channelId) : (channelName || 'general');
  const index = stableChannelHintIndex(seed, list.length);
  return formatChannelWelcomeHint(list[index], channelTag);
}
