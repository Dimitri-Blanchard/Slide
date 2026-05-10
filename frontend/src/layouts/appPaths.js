/** Top-level paths handled by the authenticated app shell (see AppLayout inner Routes). */
const APP_PREFIX_RE = /^\/(channels|team|community|nitro|security|shop|quests|settings|home|profile)(\/|$)/;

export function isAuthenticatedAppPath(pathname) {
  return APP_PREFIX_RE.test(pathname || '');
}
