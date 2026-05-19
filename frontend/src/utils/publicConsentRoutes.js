const PUBLIC_CONSENT_PATHS = new Set(['/login', '/register', '/privacy', '/terms']);

/** Routes where the dev banner may appear (root only when logged out). */
export function isPublicConsentRoute(pathname, user, loading) {
  if (PUBLIC_CONSENT_PATHS.has(pathname)) return true;
  if (pathname === '/') return !user && !loading;
  return false;
}
