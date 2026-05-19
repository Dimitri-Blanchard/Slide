import { lazy } from 'react';

const CHUNK_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \S+ failed/i;

/**
 * React.lazy wrapper that retries once on Vite chunk/HMR load failures.
 */
export function lazyRoute(importFn) {
  return lazy(() =>
    importFn().catch((err) => {
      const msg = err?.message || String(err);
      if (CHUNK_RE.test(msg)) return importFn();
      throw err;
    })
  );
}
