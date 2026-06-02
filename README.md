# Slide

The project is under active development. It works well for small groups and friends, although it is not yet able to support large servers.

## Quick start (development)

From `frontend/`:

```bash
npm install && npm run dev
```

Point the Vite dev proxy at your API if it is not the default in `vite.config.js` (`server.proxy`).

Optional: copy `frontend/.env.example` to `frontend/.env` and set `VITE_BACKEND_ORIGIN` / `VITE_PUBLIC_SITE_URL` as needed.

## Production build (web)

From `frontend/`:

```bash
npm run build
```

Set `VITE_PUBLIC_SITE_URL` (and API-related `VITE_*` vars from `frontend/.env.example`) before building so SEO tags, `robots.txt`, and `sitemap.xml` match your domain.

## Deploy (GitHub Pages)

1. **Settings → Pages → Build and deployment → Source** must be **GitHub Actions** (not “Deploy from a branch”). If it points at `main` / root, visitors see this README instead of the app, and `/qr-login` returns 404.
2. Pushes to `main` run `.github/workflows/deploy-frontend-pages.yml` and publish `frontend/dist` (SPA + `404.html` for deep links like `/qr-login`).
3. Optional repo variables (**Settings → Secrets and variables → Actions**): `VITE_API_BASE_URL`, `VITE_BACKEND_ORIGIN`, `VITE_CDN_BASE_URL`, `VITE_PUBLIC_SITE_URL` (default `https://sl1de.xyz` in the workflow).

---

Are you sliding in?
