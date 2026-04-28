# Slide

A self-hostable team and community chat: servers, channels, DMs, and voice.

The project is under active development. It is fine for small groups and friends; run larger deployments only after your own testing and hardening.

## Quick start (development)

1. **Backend** — See `backend/.env.example`. Copy to `backend/.env`, set MySQL and `JWT_SECRET`, then from `backend/`:

   ```bash
   npm install && npm start
   ```

2. **Frontend** — From `frontend/`:

   ```bash
   npm install && npm run dev
   ```

   Point the Vite dev proxy at your API if it is not the default in `vite.config.js` (`server.proxy`).

3. **Web client env** — Optional: copy `frontend/.env.example` to `frontend/.env` and set `VITE_BACKEND_ORIGIN` / `VITE_PUBLIC_SITE_URL` as needed.

## Production build (web)

From `frontend/`:

```bash
npm run build
```

Set `VITE_PUBLIC_SITE_URL` (and API-related `VITE_*` vars from `frontend/.env.example`) before building so SEO tags, `robots.txt`, and `sitemap.xml` match your domain.

## Docker

`docker-compose.yml` runs MySQL, the API, and a static frontend (port 80). Configure `backend/.env` and compose env (see `docker-compose.yml`) before deploying.

## CI

GitHub Actions (`.github/workflows/ci.yml`) installs dependencies, builds the frontend, and checks Docker images on `main`.

---

Are you sliding in?
