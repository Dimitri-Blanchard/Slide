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

**Option A — GitHub Actions (recommended)**  
**Settings → Pages → Source → GitHub Actions**. Workflow: `deploy-frontend-pages.yml`.

**Option B — Branch + `/docs` folder**  
**Settings → Pages → Source → Deploy from branch → `main` → `/docs`**. Workflow: `deploy-frontend-docs.yml` (pushes the build into `docs/` on each push).

If Source is **branch `main` / root**, GitHub shows this README — not the app. Root `index.html` redirects to `/docs/` once the docs workflow has run.

After changing settings, hard-refresh the site (Ctrl+Shift+R) or use a private window.

Optional Actions variables: `VITE_API_BASE_URL`, `VITE_BACKEND_ORIGIN`, `VITE_CDN_BASE_URL`, `VITE_PUBLIC_SITE_URL`.

---

Are you sliding in?
