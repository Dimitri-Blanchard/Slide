/** Paths allowed after login when using ?redirect= (blocks open redirects). */
const SAFE_REDIRECT = /^\/(app|channels|team|community|nitro|security|shop|quests|settings|home|profile|admin|qr-login)(\/|$|\?)/;

/** Resolve ?redirect= to an in-app path; /app maps to the default messages home. */
export function resolvePostLoginPath(redirectParam) {
  if (!redirectParam) return '/channels/@me';
  let path;
  try {
    path = decodeURIComponent(redirectParam);
  } catch {
    return '/channels/@me';
  }
  if (!path.startsWith('/') || path.startsWith('//')) return '/channels/@me';
  if (path === '/' || path === '') return '/channels/@me';
  if (path === '/app' || path.startsWith('/app/')) return '/channels/@me';
  if (SAFE_REDIRECT.test(path)) return path;
  return '/channels/@me';
}
