/** BrowserRouter basename for GitHub Pages (project /docs + custom domain). */
export function resolvePagesBasename() {
  if (typeof window === 'undefined') return '/';
  const path = window.location.pathname;
  const host = window.location.hostname.toLowerCase();

  // Repo-root Pages deploy: built files live in /docs/ (sl1de.xyz/docs/, github.io/Slide/docs/).
  if (path === '/docs' || path.startsWith('/docs/')) return '/docs';
  if (path === '/Slide/docs' || path.startsWith('/Slide/docs/')) return '/Slide/docs';

  // Branch /docs Pages deploy: docs/ folder is served at site root.
  if (host === 'sl1de.xyz' || host === 'www.sl1de.xyz') return '/';
  if (path === '/Slide' || path.startsWith('/Slide/')) return '/Slide';
  return '/';
}
