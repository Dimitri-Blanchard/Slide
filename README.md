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

**Recommended:** **Settings → Pages → Build and deployment → Source → GitHub Actions**  
Workflow: `.github/workflows/deploy-frontend-pages.yml` (builds `frontend/dist` with `CNAME` + `404.html` for SPA routes like `/qr-login`).

**Fallback (branch):** Source → **Deploy from a branch** → `main` → **`/docs`**  
Workflow: `.github/workflows/deploy-frontend-docs.yml`. Temporary URL: `https://dimitri-blanchard.github.io/Slide/docs/`

**Custom domain `sl1de.xyz`:** set it under **Settings → Pages → Custom domain**. Do **not** put `CNAME` at the repo root — only in `docs/` (branch deploy) or `frontend/public/` (Actions build).

Optional Actions variables: `VITE_API_BASE_URL`, `VITE_BACKEND_ORIGIN`, `VITE_CDN_BASE_URL`, `VITE_PUBLIC_SITE_URL`.

---

Are you sliding in?
