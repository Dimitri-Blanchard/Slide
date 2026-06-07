/** BrowserRouter basename for GitHub Pages (project /docs + custom domain). */
export function resolvePagesBasename() {
  if (typeof window === 'undefined') return '/';
  const host = window.location.hostname.toLowerCase();
  if (host === 'sl1de.xyz' || host === 'www.sl1de.xyz') return '/';
  const path = window.location.pathname;
  if (path === '/Slide/docs' || path.startsWith('/Slide/docs/')) return '/Slide/docs';
  if (path === '/Slide' || path.startsWith('/Slide/')) return '/Slide';
  return '/';
}
