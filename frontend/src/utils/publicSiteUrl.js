/** Canonical public web origin (no trailing slash). */
export function resolvePublicSiteOrigin() {
  return (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://sl1de.xyz').replace(/\/+$/, '');
}

/**
 * Path prefix when the built SPA is not at the domain root.
 * Empty when Pages source is /docs (served at sl1de.xyz/). Set to /docs when
 * Pages publishes repo root and the app lives under /docs/.
 */
export function resolvePublicSitePath() {
  const raw = (import.meta.env.VITE_PUBLIC_SITE_PATH || '').trim();
  if (!raw || raw === '/') return '';
  return raw.startsWith('/') ? raw.replace(/\/+$/, '') : `/${raw.replace(/\/+$/, '')}`;
}

/** Origin + optional path prefix, e.g. https://sl1de.xyz/docs */
export function resolvePublicSiteBase() {
  const path = resolvePublicSitePath();
  return `${resolvePublicSiteOrigin()}${path}`;
}

/** Absolute URL for a client route, e.g. publicSiteRoute('/qr-login?token=abc') */
export function publicSiteRoute(route) {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  return `${resolvePublicSiteBase()}${normalized}`;
}

/** Shareable server invite URL (public origin, not dev LAN IP). */
export function invitePublicUrl(code) {
  if (!code) return '';
  return publicSiteRoute(`/invite/${code}`);
}

/** Normalize invite path or URL to the public shareable link. */
export function resolveInviteShareUrl(url) {
  if (!url) return '';
  const match = String(url).match(/\/invite\/([A-Za-z0-9]{6,20})/);
  if (match) return invitePublicUrl(match[1]);
  if (url.startsWith('http')) return url;
  return `${resolvePublicSiteBase()}${url.startsWith('/') ? url : `/${url}`}`;
}
