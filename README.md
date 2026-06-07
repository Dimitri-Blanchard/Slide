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

**Source:** **Settings → Pages → GitHub Actions** (workflow `deploy-frontend-pages.yml`).

The workflow builds `frontend/dist`, sets `CNAME` + `404.html`, deploys, and registers **`sl1de.xyz`** as custom domain via the GitHub API.

If `sl1de.xyz` still 404 after a green deploy: open **Settings → Pages → Custom domain**, enter `sl1de.xyz`, Save, wait ~5 min for HTTPS.

Temporary URL while DNS/domain propagates: **https://dimitri-blanchard.github.io/Slide/**

Optional Actions variables: `VITE_API_BASE_URL`, `VITE_BACKEND_ORIGIN`, `VITE_CDN_BASE_URL`, `VITE_PUBLIC_SITE_URL`.

---

Are you sliding in?
