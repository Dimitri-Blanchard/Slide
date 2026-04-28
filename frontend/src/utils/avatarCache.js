const CACHE_NAME = 'slide-avatars-v1';
const blobUrls = new Map();
const pending = new Map();
const subscribers = new Map();
const lastRevalidated = new Map();
const REVALIDATE_COOLDOWN = 5 * 60 * 1000;

function isSkippable(url) {
  if (!url || typeof url !== 'string') return true;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.includes('/default/default') || url.includes('/avatars/default.png') || url.endsWith('/default.png')) return true;
  return false;
}

function notifySubs(url, blobUrl) {
  subscribers.get(url)?.forEach(cb => cb(blobUrl));
}

async function hashBlob(blob) {
  try {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return String(blob.size);
  }
}

export function getMemoryCachedSrc(url) {
  return blobUrls.get(url) || null;
}

export function subscribeAvatar(url, callback) {
  if (!subscribers.has(url)) subscribers.set(url, new Set());
  subscribers.get(url).add(callback);
  return () => subscribers.get(url)?.delete(callback);
}

export async function getCachedAvatarSrc(url) {
  if (isSkippable(url)) return null;
  if (blobUrls.has(url)) return blobUrls.get(url);
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const resp = await cache.match(url);
    if (!resp) return null;
    const blob = await resp.blob();
    if (blob.size === 0) return null;
    const blobUrl = URL.createObjectURL(blob);
    blobUrls.set(url, blobUrl);
    return blobUrl;
  } catch {
    return null;
  }
}

export async function revalidateAvatar(url) {
  if (isSkippable(url)) return;
  const lastTime = lastRevalidated.get(url);
  if (lastTime && Date.now() - lastTime < REVALIDATE_COOLDOWN) return;
  if (pending.has(url)) return pending.get(url);
  lastRevalidated.set(url, Date.now());

  const work = (async () => {
    try {
      if (!('caches' in window)) return;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const blob = await resp.blob();
      if (blob.size === 0) return;

      const newHash = await hashBlob(blob);
      const cache = await caches.open(CACHE_NAME);
      const existing = await cache.match(url);
      const existingHash = existing?.headers?.get('X-Avatar-Hash');

      if (existingHash === newHash) return;

      await cache.put(url, new Response(blob.slice(), {
        headers: { 'Content-Type': blob.type || 'image/png', 'X-Avatar-Hash': newHash },
      }));

      const old = blobUrls.get(url);
      if (old) URL.revokeObjectURL(old);
      const newBlobUrl = URL.createObjectURL(blob);
      blobUrls.set(url, newBlobUrl);
      notifySubs(url, newBlobUrl);
    } catch {
      // Network error — keep cached version
    } finally {
      pending.delete(url);
    }
  })();

  pending.set(url, work);
  return work;
}
