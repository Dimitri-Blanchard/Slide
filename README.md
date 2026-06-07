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

## Deploy (GitHub Pages) — sl1de.xyz

Le site est buildé dans `docs/` à chaque push (`deploy-frontend-docs.yml`).

**Configuration obligatoire (1 fois) :**  
https://github.com/Dimitri-Blanchard/Slide/settings/pages

1. **Source** → **Deploy from a branch** → branche **`main`** → dossier **`/docs`** (pas la racine `/`)
2. **Custom domain** → **`sl1de.xyz`** → **Save**
3. Attends 2–5 min (certificat HTTPS + propagation)

Avec `/docs` comme source, le site est servi à la racine (`sl1de.xyz/`, pas `sl1de.xyz/docs/`).

Build local pour Pages : `npm run build:pages` (dans `frontend/`).

**Si le site ne charge pas :**
- `sl1de.xyz` → 404 : la source Pages n’est pas `/docs`, ou le déploiement n’a pas encore tourné.
- Écran noir après chargement : vider le cache ou ouvrir en navigation privée (assets hashés).
- Test intermédiaire (déploiement racine `/`) : https://dimitri-blanchard.github.io/Slide/docs/

DNS (A records GitHub) :
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

---

Are you sliding in?
