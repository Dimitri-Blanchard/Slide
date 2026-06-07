import { getStaticUrl } from './staticUrl';
import { getMemoryCachedSrc, getCachedAvatarSrc } from './avatarCache';

const colorCache = new Map();
const DEFAULT = '#2b2d31';

function isDefaultAvatar(path) {
  if (!path) return true;
  return path.includes('/default/default') || path.includes('/avatars/default.png') || path.endsWith('/default.png');
}

function darkenRgb(r, g, b, factor = 0.4) {
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

export async function resolveAvatarImageSrc(avatarPath) {
  if (!avatarPath || isDefaultAvatar(avatarPath)) return null;
  const url = getStaticUrl(avatarPath);
  return getMemoryCachedSrc(url) || (await getCachedAvatarSrc(url)) || url;
}

export function extractAvatarBlendColor(imageSrc) {
  if (!imageSrc) return Promise.resolve(DEFAULT);
  if (colorCache.has(imageSrc)) return Promise.resolve(colorCache.get(imageSrc));

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 36;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(DEFAULT);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 48) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n += 1;
        }
        if (!n) {
          resolve(DEFAULT);
          return;
        }
        const color = darkenRgb(r / n, g / n, b / n);
        colorCache.set(imageSrc, color);
        resolve(color);
      } catch {
        resolve(DEFAULT);
      }
    };
    img.onerror = () => resolve(DEFAULT);
    img.src = imageSrc;
  });
}

export async function getAvatarBlendColor(avatarPath) {
  const src = await resolveAvatarImageSrc(avatarPath);
  if (!src) return DEFAULT;
  return extractAvatarBlendColor(src);
}
