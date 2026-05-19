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

Pushes to `main` build and deploy the static site via `.github/workflows/deploy-frontend-pages.yml`. Set repository variables `VITE_API_BASE_URL`, `VITE_BACKEND_ORIGIN`, and `VITE_CDN_BASE_URL` in GitHub **Settings → Secrets and variables → Actions**.

---

Are you sliding in?
