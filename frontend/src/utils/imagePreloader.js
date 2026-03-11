/**
 * Image preloader — prefetches images so they're in browser cache before display.
 * Used for avatars, banners, etc. to eliminate loading delay when opening profile cards.
 */

const preloaded = new Set();
const pending = new Map();

export function prefetchImage(url) {
  if (!url || typeof url !== 'string') return Promise.resolve();
  if (url.startsWith('data:') || url.startsWith('blob:')) return Promise.resolve();
  const normalized = url.split('?')[0];
  if (preloaded.has(normalized)) return Promise.resolve();
  if (pending.has(normalized)) return pending.get(normalized);

  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      preloaded.add(normalized);
      pending.delete(normalized);
      resolve();
    };
    img.onerror = () => {
      pending.delete(normalized);
      resolve();
    };
    img.src = url;
  });
  pending.set(normalized, p);
  return p;
}

export function prefetchImages(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return Promise.resolve();
  return Promise.all(urls.filter(Boolean).map((u) => prefetchImage(u)));
}
