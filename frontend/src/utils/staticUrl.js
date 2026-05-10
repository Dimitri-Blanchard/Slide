/**
 * Resolves static file URLs for /uploads/* and /avatars/*
 * - If CDN is configured (VITE_CDN_BASE_URL or electron.cdnBaseUrl), uses CDN
 * - Otherwise uses the fixed backend origin
 * - Absolute URLs (http/https) are returned as-is
 */

const FIXED_BACKEND_ORIGIN = 'https://api.sl1de.xyz';

function getStaticBase() {
  const isElectron = typeof window !== 'undefined' && !!window.electron?.isElectron;
  const isCapacitor = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
  const isNativeRuntime = isElectron || isCapacitor;
  // CDN takes priority when configured
  const cdn = (import.meta.env.VITE_CDN_BASE_URL || (typeof window !== 'undefined' && window.electron?.cdnBaseUrl) || '').trim();
  if (cdn) return cdn.replace(/\/$/, '');
  // Trim env (GH Actions injects "" when vars.* is unset; that empty string
  // would slip past a plain `||` check before).
  const webBackendOrigin = (import.meta.env.VITE_BACKEND_ORIGIN || '').trim();
  if (!isNativeRuntime && webBackendOrigin) return webBackendOrigin.replace(/\/$/, '');
  // Web: NEVER fall back to window.location.origin. sl1de.xyz is on GitHub
  // Pages with no backend, so /uploads, /avatars, /socket.io etc. all 404.
  // Use the public API origin instead.
  if (!isNativeRuntime) return FIXED_BACKEND_ORIGIN;
  // Electron: use relative URLs → routed through local proxy (main.cjs createStaticServer)
  // This avoids ERR_CONNECTION_REFUSED / ERR_QUIC_PROTOCOL_ERROR from direct Chromium fetch.
  if (isElectron && typeof window !== 'undefined') return window.location.origin;
  // Capacitor uses FIXED_BACKEND_ORIGIN.
  return isCapacitor ? FIXED_BACKEND_ORIGIN : '';
}

/**
 * Returns the full URL for a static asset.
 * @param {string} path - Path like /uploads/avatars/x.png or /avatars/default.png
 * @returns {string} Full URL (CDN or origin + path)
 */
export function getStaticUrl(path) {
  if (!path || typeof path !== 'string') return path || '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('blob:') || path.startsWith('data:')) return path;
  const base = getStaticBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
