/** Top-level paths handled by the authenticated app shell (see AppLayout inner Routes). */
const APP_PREFIX_RE = /^\/(channels|community|friends|nitro|security|quests|settings|home|profile)(\/|$)/;

/** Full-screen mobile pages (not bottom-tab home/notifications/profile). */
export const MOBILE_FULL_PAGE_ROUTES = new Set(['/friends', '/security', '/nitro', '/quests', '/settings']);

export function isSettingsRoute(pathname) {
  return /^\/settings(\/|$)/.test(pathname || '');
}

export function isServerSettingsRoute(pathname) {
  return /^\/channels\/\d+\/settings(\/|$|\?)/.test(pathname || '');
}

export function isChannelSettingsRoute(pathname) {
  return /^\/channels\/\d+\/\d+\/settings(\/|$|\?)/.test(pathname || '');
}

export function isMobileFullPageRoute(pathname) {
  return MOBILE_FULL_PAGE_ROUTES.has(pathname || '')
    || isServerSettingsRoute(pathname)
    || isChannelSettingsRoute(pathname);
}

export function isAuthenticatedAppPath(pathname) {
  return APP_PREFIX_RE.test(pathname || '');
}
