import { getToken } from './tokenStorage';

/** True when this bundle is built for Capacitor / Electron (no marketing site). */
export function isClientBuild() {
  return (
    import.meta.env.VITE_CAPACITOR === '1' ||
    import.meta.env.VITE_ELECTRON === '1'
  );
}

/** True when running inside the native APK, iOS app, or Electron shell. */
export function isClientApp() {
  if (isClientBuild()) return true;
  if (typeof window === 'undefined') return false;
  return !!(
    window.Capacitor?.isNativePlatform?.() ||
    window.electron?.isElectron
  );
}

export function isLandingPath(pathname) {
  const p = pathname || '';
  return p === '/' || p === '';
}

/** Settings modal (16:9, up to 1600px) vs full-screen route — native apps always use the route. */
export function shouldUseSettingsModal(platform, viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200) {
  if (platform?.isMobileDevice) return false;
  if (platform?.isElectron && viewportWidth > 768) return true;
  return viewportWidth >= 960;
}

/** Custom app title bar: Electron always; browser on app routes (not marketing landing). Hidden on mobile shell. */
export function shouldShowAppTitleBar(pathname) {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return false;
  if (typeof window !== 'undefined' && document.documentElement.classList.contains('platform-mobile')) {
    return false;
  }
  if (typeof window !== 'undefined' && window.electron?.isElectron) return true;
  return !isLandingPath(pathname);
}

/** In-app home: never the marketing landing page `/`. */
export function getClientHomePath({ user, hasToken } = {}) {
  if (user || hasToken) return '/channels/@me';
  return '/login';
}

export function resolveClientHomePath(auth = {}) {
  const hasToken = auth.hasToken ?? !!getToken();
  return getClientHomePath({ user: auth.user, hasToken });
}

/** Hash target when Capacitor opens on marketing `/` (after token restore). */
export function getCapacitorBootHash() {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) {
    return null;
  }
  const hash = window.location.hash || '';
  const path = (hash.slice(1).split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (path !== '/' && path !== '') return null;
  return getToken() ? '#/channels/@me' : '#/login';
}

/** Redirect native app away from `/` before React paints the marketing site. */
export function applyCapacitorBootRedirect() {
  const target = getCapacitorBootHash();
  if (!target || window.location.hash === target) return;
  window.location.replace(`${window.location.pathname}${window.location.search}${target}`);
}

/** Electron HashRouter: skip blank `#/` and land on login or DMs before first paint. */
export function getElectronBootHash() {
  if (typeof window === 'undefined' || !window.electron?.isElectron) return null;
  const hash = window.location.hash || '';
  const path = (hash.slice(1).split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (path !== '/' && path !== '') return null;
  return getToken() ? '#/channels/@me' : '#/login';
}

export function applyElectronBootRedirect() {
  const target = getElectronBootHash();
  if (!target || window.location.hash === target) return;
  window.location.replace(`${window.location.pathname}${window.location.search}${target}`);
}
