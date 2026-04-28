/**
 * App update check — used by Electron desktop app on launch.
 * Public endpoint, no auth required.
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const downloadsDir = path.resolve(__dirname, '../downloads');

function parseVersion(v) {
  if (!v || typeof v !== 'string') return [0, 0, 0];
  const parts = v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function pickLatestByExtension(files, ext) {
  const matching = files.filter((name) => path.extname(name).toLowerCase() === ext);
  if (matching.length === 0) return null;
  return matching
    .map((name) => {
      const fullPath = path.join(downloadsDir, name);
      const stat = fs.statSync(fullPath);
      return { name, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.name || null;
}

/**
 * GET /api/app/update-check?platform=win32&version=1.0.0
 * Returns update info if a newer version is available.
 */
router.get('/update-check', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');

  const platform = (req.query.platform || '').toLowerCase();
  const currentVersion = (req.query.version || '').trim();

  const latestVersion = process.env.APP_LATEST_VERSION || '1.0.0';
  const updateUrlWin = process.env.APP_UPDATE_URL_WIN32 || null;

  if (!currentVersion) {
    return res.status(400).json({ error: 'version query param required' });
  }

  const updateAvailable = isNewer(latestVersion, currentVersion);

  if (!updateAvailable) {
    return res.json({ updateAvailable: false, version: currentVersion });
  }

  let downloadUrl = null;
  if (platform === 'win32' && updateUrlWin) {
    downloadUrl = updateUrlWin;
  }

  res.json({
    updateAvailable: true,
    version: latestVersion,
    downloadUrl,
    releaseNotes: process.env.APP_UPDATE_RELEASE_NOTES || null,
  });
});

/**
 * GET /api/app/downloads/latest
 * Returns latest release artifacts from backend/downloads:
 *  - one .rar (windows)
 *  - one .apk (android)
 */
router.get('/downloads/latest', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!fs.existsSync(downloadsDir)) {
      return res.json({ windows: null, android: null });
    }

    const files = fs.readdirSync(downloadsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    const windowsFile = pickLatestByExtension(files, '.rar');
    const androidFile = pickLatestByExtension(files, '.apk');

    const toPayload = (filename) => (
      filename
        ? { filename, url: `/download/${encodeURIComponent(filename)}` }
        : null
    );

    return res.json({
      windows: toPayload(windowsFile),
      android: toPayload(androidFile),
    });
  } catch (err) {
    console.error('[app/downloads/latest] Failed to read downloads directory:', err?.message || err);
    return res.status(500).json({ error: 'Unable to resolve download artifacts' });
  }
});

export default router;
