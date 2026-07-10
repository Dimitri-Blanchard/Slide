/** BrowserRouter basename for GitHub Pages (project /docs + custom domain). */
export function resolvePagesBasename() {
  if (typeof window === 'undefined') return '/';
  const path = window.location.pathname;
  const host = window.location.hostname.toLowerCase();

  // Custom domain: app is served at site root (sl1de.xyz/channels/…).
  if (host === 'sl1de.xyz' || host === 'www.sl1de.xyz') return '/';

  // Repo-root Pages deploy with app copied under /docs/ (github.io/Slide/docs/).
  if (path === '/docs' || path.startsWith('/docs/')) return '/docs';
  if (path === '/Slide/docs' || path.startsWith('/Slide/docs/')) return '/Slide/docs';

  // Branch /docs Pages deploy: docs/ folder is served at site root.
  if (path === '/Slide' || path.startsWith('/Slide/')) return '/Slide';
  return '/';
}

/** Absolute URL prefix for public/ assets (logo.png, icon.png). */
export function resolvePublicPathPrefix() {
  const basename = resolvePagesBasename();
  return basename === '/' ? '/' : `${basename}/`;
}
