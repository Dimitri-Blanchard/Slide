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

/** In-app home: never the marketing landing page `/`. */
export function getClientHomePath({ user, hasToken } = {}) {
  if (user || hasToken) return '/channels/@me';
  return '/login';
}

export function resolveClientHomePath(auth = {}) {
  const hasToken = auth.hasToken ?? !!getToken();
  return getClientHomePath({ user: auth.user, hasToken });
}
