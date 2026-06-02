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

**Settings → Pages → Build and deployment:**

- **Source:** Deploy from a branch  
- **Branch:** `main`  
- **Folder:** `/docs` (not `/` root)

The built site lives in `docs/` (updated by `deploy-frontend-docs.yml` on each push to `frontend/`). With custom domain `sl1de.xyz`, URLs are at the root (`https://sl1de.xyz/`, not `/docs/` in the browser).

If everything 404s, the `/docs` folder was missing or Pages pointed at an empty branch — fix the folder setting above, then wait 1–2 minutes.

Optional Actions variables: `VITE_API_BASE_URL`, `VITE_BACKEND_ORIGIN`, `VITE_CDN_BASE_URL`, `VITE_PUBLIC_SITE_URL`.

---

Are you sliding in?
