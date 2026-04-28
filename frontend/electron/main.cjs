const {
  app, BrowserWindow, ipcMain, Menu, Tray, nativeImage,
  session, desktopCapturer, Notification, powerSaveBlocker,
  shell, dialog, globalShortcut, screen, safeStorage,
} = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const zlib = require('zlib');
const { exec } = require('child_process');

try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch (_) {}

// ─── Config ───────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';
/** Electron app MUST always use this backend (no override) */
const ELECTRON_BACKEND_URL = 'https://api.sl1de.xyz';
const PROXY_PATHS = ['/avatars', '/uploads', '/api', '/socket.io'];

if (isDev) app.commandLine.appendSwitch('ignore-certificate-errors');

// ─── Network stability ──────────────────────────────────────────────────────
// Disable QUIC (HTTP/3) — Electron's Chromium QUIC implementation causes
// ERR_QUIC_PROTOCOL_ERROR on many networks. Force HTTP/2 + TCP instead.
app.commandLine.appendSwitch('disable-quic');
// Disable HTTP/2 server push which can also cause issues in Electron
app.commandLine.appendSwitch('disable-http2-server-push');

// ─── GPU / rendering ─────────────────────────────────────────────────────────
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
// Enable hardware acceleration — let Chromium pick the best GPU backend
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Use hardware-accelerated video decode when available
app.commandLine.appendSwitch('enable-accelerated-video-decode');

// ─── Single instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ─── State ────────────────────────────────────────────────────────────────────
let splashWindow = null;
let mainWindow = null;
let tray = null;
let powerSaveId = null;
let minimizeToTray = true; // Always minimize to tray by default (like Discord)
let pendingSourceId = null;
let currentBadgeCount = 0;
let currentVoiceState = 'idle'; // 'idle' | 'call' | 'speaking' | 'muted'
let speakingAnimInterval = null;
app.isQuitting = false;

// ─── PNG badge generation (16×16 for Windows overlay icon) ────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function buildPng(size, drawFn) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4, 0);
    for (let x = 0; x < size; x++) {
      const rgba = drawFn(x, y, size);
      if (rgba) {
        row[1 + x * 4]     = rgba[0];
        row[1 + x * 4 + 1] = rgba[1];
        row[1 + x * 4 + 2] = rgba[2];
        row[1 + x * 4 + 3] = rgba[3];
      }
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  return Buffer.concat([
    sig, pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// 3×5 digit bitmaps for numbers 1-9
const DIGIT_FONT = {
  1: [0,1,0, 1,1,0, 0,1,0, 0,1,0, 1,1,1],
  2: [1,1,1, 0,0,1, 1,1,1, 1,0,0, 1,1,1],
  3: [1,1,1, 0,0,1, 1,1,1, 0,0,1, 1,1,1],
  4: [1,0,1, 1,0,1, 1,1,1, 0,0,1, 0,0,1],
  5: [1,1,1, 1,0,0, 1,1,1, 0,0,1, 1,1,1],
  6: [1,1,1, 1,0,0, 1,1,1, 1,0,1, 1,1,1],
  7: [1,1,1, 0,0,1, 0,1,0, 0,1,0, 0,1,0],
  8: [1,1,1, 1,0,1, 1,1,1, 1,0,1, 1,1,1],
  9: [1,1,1, 1,0,1, 1,1,1, 0,0,1, 1,1,1],
};

// Red circle with white digit (mentions/pings)
function createMentionBadge(count) {
  const digit = DIGIT_FONT[Math.min(count, 9)];
  return buildPng(16, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    if (dx * dx + dy * dy > 56) return null; // radius ~7.5
    // Check if pixel is part of the digit
    const gx = x - 7, gy = y - 6; // center the 3×5 glyph
    if (digit && gx >= 0 && gx < 3 && gy >= 0 && gy < 5 && digit[gy * 3 + gx]) {
      return [255, 255, 255, 255]; // white text
    }
    return [237, 66, 69, 255]; // Discord red
  });
}

// White filled circle (unread server messages, no mentions)
function createUnreadBadge() {
  return buildPng(16, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    if (dx * dx + dy * dy <= 36) return [255, 255, 255, 255]; // radius 6
    return null;
  });
}

// Small white dot (DM/group unread)
function createDmDotBadge() {
  return buildPng(16, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    if (dx * dx + dy * dy <= 20) return [255, 255, 255, 255]; // radius ~4.5
    return null;
  });
}

const _badgeCache = {};
function getBadgeIcon(type, count) {
  const key = `${type}_${count || 0}`;
  if (!_badgeCache[key]) {
    let buf;
    if (type === 'mention') buf = createMentionBadge(count);
    else if (type === 'unread') buf = createUnreadBadge();
    else if (type === 'dm') buf = createDmDotBadge();
    else return null;
    _badgeCache[key] = nativeImage.createFromBuffer(buf);
  }
  return _badgeCache[key];
}

// ─── Badge ───────────────────────────────────────────────────────────────────
// data: { mentions, hasUnreadServer, hasUnreadDm } or a plain number (legacy)
function updateBadge(data) {
  let mentions = 0, hasUnreadServer = false, hasUnreadDm = false;
  if (typeof data === 'object' && data !== null) {
    mentions = Math.min(data.mentions || 0, 9);
    hasUnreadServer = !!data.hasUnreadServer;
    hasUnreadDm = !!data.hasUnreadDm;
  } else {
    mentions = Math.max(0, parseInt(data) || 0);
  }
  const totalForTray = mentions + (hasUnreadServer ? 1 : 0) + (hasUnreadDm ? 1 : 0);
  currentBadgeCount = mentions || (hasUnreadDm ? 1 : 0) || (hasUnreadServer ? 1 : 0);

  if (process.platform === 'darwin' || process.platform === 'linux') {
    app.setBadgeCount(mentions || (hasUnreadDm || hasUnreadServer ? 1 : 0));
  }
  if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
    let icon = null, tooltip = '';
    if (mentions > 0) {
      icon = getBadgeIcon('mention', mentions);
      tooltip = `${mentions} mention${mentions > 1 ? 's' : ''}`;
    } else if (hasUnreadDm) {
      icon = getBadgeIcon('dm');
      tooltip = 'Nouveaux messages directs';
    } else if (hasUnreadServer) {
      icon = getBadgeIcon('unread');
      tooltip = 'Messages non lus';
    }
    mainWindow.setOverlayIcon(icon, tooltip);
  }
  updateTrayMenu(mentions || (hasUnreadDm || hasUnreadServer ? 1 : 0));
}

// ─── Tray icon generation (16×16 for system tray) ─────────────────────────────

// Default Slide icon (loaded from file)
let trayIconDefault = null;

// Speech bubble icon — green bubble with sound waves
function buildSpeakingIcon(frame = 0) {
  return buildPng(16, (x, y) => {
    // Speech bubble shape (rounded rect 2..13 x 2..11, tail at bottom-left)
    const inBubble = x >= 2 && x <= 13 && y >= 2 && y <= 10;
    const isTail = (x === 3 && y === 11) || (x === 2 && y === 12) || (x === 4 && y === 11);
    const isCorner = (x === 2 && y === 2) || (x === 13 && y === 2) ||
                     (x === 2 && y === 10) || (x === 13 && y === 10);

    if ((inBubble && !isCorner) || isTail) {
      // Sound wave lines inside the bubble (animated by frame)
      const cx = 7.5, cy = 6;
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));

      // Animate: show 1-3 arcs based on frame
      const waveCount = (frame % 3) + 1;
      if (dist >= 1 && dist < 2 && waveCount >= 1 && x > cx) return [255, 255, 255, 230];
      if (dist >= 2.5 && dist < 3.5 && waveCount >= 2 && x > cx) return [255, 255, 255, 180];
      if (dist >= 4 && dist < 5 && waveCount >= 3 && x > cx) return [255, 255, 255, 130];

      // Center dot (mouth)
      if (dist < 1.2) return [255, 255, 255, 255];

      // Bubble fill — green
      return [35, 165, 90, 255];
    }
    return null;
  });
}

// Muted mic icon — red mic with strikethrough
function buildMutedMicIcon() {
  return buildPng(16, (x, y) => {
    // Mic body (rect 6..9 x 2..9 with rounded top)
    const inMicBody = x >= 6 && x <= 9 && y >= 3 && y <= 9;
    const micTop = x >= 7 && x <= 8 && y === 2;
    const micBottom = x >= 7 && x <= 8 && y === 10;
    // Mic stand
    const stand = x >= 5 && x <= 10 && y === 11 &&
                  (x === 5 || x === 10 || (x >= 7 && x <= 8));
    const standArm = (x === 5 || x === 10) && (y === 10 || y === 11);
    const standBase = x >= 6 && x <= 9 && y === 13;
    const standPole = (x === 7 || x === 8) && y === 12;

    // Strikethrough line (diagonal, red)
    const onStrike = Math.abs((x - 2) - (y - 1)) < 1.2 && x >= 2 && x <= 13 && y >= 1 && y <= 14;

    if (onStrike) return [239, 68, 68, 255]; // red line on top

    if (inMicBody || micTop || micBottom) return [180, 60, 60, 255]; // darker red mic
    if (stand || standArm || standBase || standPole) return [180, 60, 60, 200];

    return null;
  });
}

// In-call icon (no speaking, no mute) — green headphone/phone
function buildInCallIcon() {
  return buildPng(16, (x, y) => {
    const cx = 7.5, cy = 7.5;
    const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    // Ring
    if (dist >= 4.5 && dist <= 6.5 && y <= 9) return [35, 165, 90, 255];
    // Ear pads
    if (x >= 2 && x <= 4 && y >= 7 && y <= 12) return [35, 165, 90, 255];
    if (x >= 11 && x <= 13 && y >= 7 && y <= 12) return [35, 165, 90, 255];
    return null;
  });
}

const _trayIconCache = {};
function getTrayIcon(type, frame) {
  const key = `${type}_${frame || 0}`;
  if (!_trayIconCache[key]) {
    let buf;
    if (type === 'speaking') buf = buildSpeakingIcon(frame || 0);
    else if (type === 'muted') buf = buildMutedMicIcon();
    else if (type === 'call') buf = buildInCallIcon();
    else return trayIconDefault;
    _trayIconCache[key] = nativeImage.createFromBuffer(buf);
  }
  return _trayIconCache[key];
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function updateTrayVoiceState(state) {
  if (!tray) return;
  currentVoiceState = state;

  // Stop any existing animation
  if (speakingAnimInterval) {
    clearInterval(speakingAnimInterval);
    speakingAnimInterval = null;
  }

  if (state === 'speaking') {
    let frame = 0;
    // Animate the speaking icon at ~4fps
    const updateFrame = () => {
      if (!tray || currentVoiceState !== 'speaking') return;
      tray.setImage(getTrayIcon('speaking', frame));
      frame = (frame + 1) % 3;
    };
    updateFrame();
    speakingAnimInterval = setInterval(updateFrame, 250);
    tray.setToolTip('Slide — En train de parler');
  } else if (state === 'muted') {
    tray.setImage(getTrayIcon('muted'));
    tray.setToolTip('Slide — Micro coupé');
  } else if (state === 'call') {
    tray.setImage(getTrayIcon('call'));
    tray.setToolTip('Slide — En appel');
  } else {
    // idle — restore default icon
    if (trayIconDefault) tray.setImage(trayIconDefault);
    tray.setToolTip('Slide');
  }
  updateTrayMenu();
}

function updateTrayMenu(count = currentBadgeCount) {
  if (!tray) return;
  try {
    const label = count > 0
      ? `Ouvrir Slide (${count} non lu${count > 1 ? 's' : ''})`
      : 'Ouvrir Slide';
    if (currentVoiceState === 'idle') {
      tray.setToolTip(count > 0 ? `Slide — ${count} non lu${count > 1 ? 's' : ''}` : 'Slide');
    }

    const menuItems = [
      { label, click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
    ];

    // Voice controls in context menu when in call
    if (currentVoiceState !== 'idle') {
      menuItems.push({
        label: currentVoiceState === 'muted' ? '🔇 Unmute' : '🎤 Mute',
        click: () => safeSend(mainWindow, 'tray-toggle-mute'),
      });
      menuItems.push({
        label: '📞 Quitter l\'appel',
        click: () => safeSend(mainWindow, 'tray-leave-call'),
      });
      menuItems.push({ type: 'separator' });
    }

    menuItems.push({ label: 'Quitter Slide', click: () => { app.isQuitting = true; app.quit(); } });
    tray.setContextMenu(Menu.buildFromTemplate(menuItems));
  } catch (_) {}
}

function createTray() {
  const iconPath = path.join(__dirname, '../public/icon.png');
  try {
    trayIconDefault = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    trayIconDefault = nativeImage.createEmpty();
  }
  tray = new Tray(trayIconDefault);
  updateTrayMenu(0);
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── Window state persistence ─────────────────────────────────────────────────
function getStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(getStateFile(), 'utf8')); }
  catch { return null; }
}
function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fs.writeFileSync(getStateFile(), JSON.stringify(
      { x: b.x, y: b.y, width: b.width, height: b.height, isMaximized: win.isMaximized() }
    ));
  } catch (_) {}
}
function isValidBounds(b) {
  if (!b || typeof b.x !== 'number') return false;
  return screen.getAllDisplays().some(d => {
    const r = d.bounds;
    return b.x < r.x + r.width && b.y < r.y + r.height &&
           b.x + b.width > r.x && b.y + b.height > r.y;
  });
}

// ─── Persisted settings ──────────────────────────────────────────────────────
function getSettingsFile() {
  return path.join(app.getPath('userData'), 'slide-settings.json');
}
function loadPersistedSettings() {
  try { return JSON.parse(fs.readFileSync(getSettingsFile(), 'utf8')); }
  catch { return {}; }
}
function savePersistedSetting(key, value) {
  try {
    const data = loadPersistedSettings();
    data[key] = value;
    fs.writeFileSync(getSettingsFile(), JSON.stringify(data));
  } catch (_) {}
}

// Load minimize-to-tray from persisted settings (default: true)
(function initPersistedSettings() {
  const saved = loadPersistedSettings();
  if (typeof saved.minimizeToTray === 'boolean') {
    minimizeToTray = saved.minimizeToTray;
  }
})();

// ─── System power commands ────────────────────────────────────────────────────
const SYSTEM_CMDS = {
  reboot: {
    win32:  'shutdown /r /t 0',
    darwin: "osascript -e 'tell app \"System Events\" to restart'",
    linux:  'systemctl reboot',
  },
  shutdown: {
    win32:  'shutdown /s /t 0',
    darwin: "osascript -e 'tell app \"System Events\" to shut down'",
    linux:  'systemctl poweroff',
  },
  sleep: {
    win32:  'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
    darwin: 'pmset sleepnow',
    linux:  'systemctl suspend',
  },
};
function runSystemCommand(action) {
  const cmd = SYSTEM_CMDS[action]?.[process.platform] || SYSTEM_CMDS[action]?.linux;
  if (!cmd) return Promise.reject(new Error('Platform not supported'));
  return new Promise((resolve, reject) => exec(cmd, (err) => err ? reject(err) : resolve()));
}

// ─── Static proxy server ──────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.wasm': 'application/wasm', '.map': 'application/json',
};

function proxyToBackend(req, res) {
  const parsed = url.parse(ELECTRON_BACKEND_URL);
  const lib = parsed.protocol === 'https:' ? https : http;
  const port = parsed.port || (parsed.protocol === 'https:' ? 443 : 80);
  const fwdHeaders = { ...req.headers, host: parsed.host };
  delete fwdHeaders.origin; delete fwdHeaders.referer;
  const proxyReq = lib.request(
    { hostname: parsed.hostname, port, path: req.url, method: req.method, headers: fwdHeaders },
    (proxyRes) => { res.writeHead(proxyRes.statusCode, proxyRes.headers); proxyRes.pipe(res); }
  );
  proxyReq.on('error', (err) => {
    console.error(`[proxy] error: ${err.message}`);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Backend unavailable');
  });
  req.pipe(proxyReq);
}

function createStaticServer(distPath) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url);
      if (PROXY_PATHS.some(p => parsed.pathname.startsWith(p))) return proxyToBackend(req, res);
      let filePath = path.join(distPath, parsed.pathname === '/' ? 'index.html' : parsed.pathname);
      if (!path.relative(distPath, path.resolve(filePath)).startsWith('..')) {
        fs.readFile(filePath, (err, data) => {
          if (err) {
            if (err.code === 'ENOENT') {
              fs.readFile(path.join(distPath, 'index.html'), (e2, d2) => {
                res.writeHead(e2 ? 404 : 200, { 'Content-Type': 'text/html' });
                res.end(e2 ? 'Not found' : d2);
              });
            } else res.writeHead(500).end();
          } else {
            res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
            res.end(data);
          }
        });
      } else res.writeHead(403).end();
    });
    // WebSocket upgrade proxy (needed for Socket.IO)
    server.on('upgrade', (req, socket, head) => {
      const parsed = url.parse(req.url);
      if (!PROXY_PATHS.some(p => parsed.pathname.startsWith(p))) {
        socket.destroy();
        return;
      }
      const backend = url.parse(ELECTRON_BACKEND_URL);
      const lib = backend.protocol === 'https:' ? https : http;
      const port = backend.port || (backend.protocol === 'https:' ? 443 : 80);
      const fwdHeaders = { ...req.headers, host: backend.host };
      delete fwdHeaders.origin;
      delete fwdHeaders.referer;
      const proxyReq = lib.request({
        hostname: backend.hostname,
        port,
        path: req.url,
        method: req.method,
        headers: fwdHeaders,
      });
      proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        socket.write(
          `HTTP/1.1 ${proxyRes.statusCode || 101} ${proxyRes.statusMessage || 'Switching Protocols'}\r\n` +
          Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
          '\r\n\r\n'
        );
        if (proxyHead.length) socket.write(proxyHead);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
        proxySocket.on('error', () => socket.destroy());
        socket.on('error', () => proxySocket.destroy());
      });
      proxyReq.on('error', () => socket.destroy());
      proxyReq.end();
    });

    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/** Safely send IPC to renderer — no-op if window destroyed (avoids "Render frame was disposed" crash) */
function safeSend(win, channel, ...args) {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch (_) {}
}

// ─── Auto-update check (backend-driven) ────────────────────────────────────────

function httpGet(uri) {
  return new Promise((resolve, reject) => {
    const u = url.parse(uri);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(uri, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function downloadFile(uri, destPath) {
  return new Promise((resolve, reject) => {
    const u = url.parse(uri);
    const lib = u.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = lib.get(uri, { timeout: 120000 }, (res) => {
      if (res.statusCode >= 400) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    });
    req.on('error', () => { file.close(); fs.unlink(destPath, () => {}); reject(); });
    file.on('error', (e) => { file.close(); fs.unlink(destPath, () => {}); reject(e); });
  });
}

async function checkForUpdates() {
  try {
    const currentVersion = app.getVersion();
    const platform = process.platform;
    const checkUrl = `${ELECTRON_BACKEND_URL}/api/app/update-check?platform=${platform}&version=${encodeURIComponent(currentVersion)}`;
    const data = await httpGet(checkUrl);

    if (!data.updateAvailable || !data.downloadUrl) return;

    const { response } = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: 'Update available',
      message: `Slide ${data.version} is available. You have ${currentVersion}.`,
      detail: data.releaseNotes || 'Would you like to download and install the update now?',
      buttons: ['Download and install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response !== 0) return;

    const ext = platform === 'win32' ? '.exe' : platform === 'darwin' ? '.dmg' : '.AppImage';
    const destPath = path.join(app.getPath('temp'), `Slide-Setup-${data.version}${ext}`);

    try {
      await downloadFile(data.downloadUrl, destPath);
      shell.openPath(destPath).then((err) => {
        if (err) console.error('Update installer open error:', err);
        app.isQuitting = true;
        app.quit();
      });
    } catch (e) {
      dialog.showErrorBox('Update failed', `Could not download update: ${e?.message || 'Unknown error'}`);
    }
  } catch (e) {
    // Silent fail — don't block app startup
  }
}

// ─── Splash window ────────────────────────────────────────────────────────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400, height: 300,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

// ─── Main window ──────────────────────────────────────────────────────────────
async function createMainWindow() {
  const state = loadWindowState();
  const validBounds = state && isValidBounds(state);

  const winOpts = {
    width: (validBounds && state.width) || 1280,
    height: (validBounds && state.height) || 800,
    minWidth: 900, minHeight: 600,
    show: false, frame: false,
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'Slide',
    backgroundColor: '#1e1f22',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  };
  if (validBounds) { winOpts.x = state.x; winOpts.y = state.y; }

  const win = new BrowserWindow(winOpts);

  // Persist window state on move/resize
  const debouncedSave = debounce(() => saveWindowState(win), 500);
  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);

  // Close → minimize to tray OR quit
  win.on('close', (e) => {
    saveWindowState(win);
    if (minimizeToTray && !app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Notify renderer on show/hide (for tray-aware unread logic)
  win.on('show', () => safeSend(win, 'window-visibility-change', true));
  win.on('hide', () => safeSend(win, 'window-visibility-change', false));
  win.on('focus', () => safeSend(win, 'window-focus-change', true));
  win.on('blur', () => safeSend(win, 'window-focus-change', false));

  // DevTools toggle
  win.webContents.on('before-input-event', (_, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
    }
  });

  // Open external links in OS browser
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:\/\//i.test(u)) shell.openExternal(u);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('https://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const distPath = path.join(__dirname, '../dist');
    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
      console.error('[Slide] dist/index.html not found at:', indexPath);
      console.error('[Slide] Run "npm run build" before launching in production mode.');
      // Fall back to dev server
      try {
        win.loadURL('https://localhost:5173');
      } catch (_) {
        win.loadURL(`data:text/html,<h1 style="color:white;font-family:sans-serif;text-align:center;margin-top:200px">Build not found. Run npm run build first.</h1>`);
      }
    } else {
      const loadUrl = await createStaticServer(distPath);
      win.loadURL(loadUrl);
    }
  }

  // Log load failures and retry once after a short delay
  let loadRetried = false;
  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[Slide] Page load failed: ${errorCode} ${errorDescription}`);
    if (!loadRetried && errorCode !== -3) { // -3 = aborted (intentional navigation)
      loadRetried = true;
      console.log('[Slide] Retrying page load in 2s...');
      setTimeout(() => {
        if (!win.isDestroyed()) win.webContents.reload();
      }, 2000);
    }
  });

  let shown = false;
  const showWindow = () => {
    if (shown) return;
    shown = true;
    if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null; }
    if (state?.isMaximized) win.maximize();
    win.show();
    win.focus();
  };
  win.once('ready-to-show', showWindow);
  // Fallback: force-show after 8s even if ready-to-show never fires (black screen fix)
  setTimeout(showWindow, 8000);

  win.on('maximize', () => safeSend(win, 'window-maximize-change', true));
  win.on('unmaximize', () => safeSend(win, 'window-maximize-change', false));

  return win;
}

// ─── App ready ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // Grant all permissions
  session.defaultSession.setPermissionRequestHandler((_, permission, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);

  // Screen sharing: use pending source if set, otherwise primary screen.
  // Windows: loopback captures system/screen audio even when `video` is a single window.
  session.defaultSession.setDisplayMediaRequestHandler(async (_, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      let chosen = pendingSourceId ? sources.find(s => s.id === pendingSourceId) : null;
      pendingSourceId = null;
      if (!chosen) {
        chosen = sources.find(s => s.id === 'screen:0:0')
          || sources.find(s => s.id.startsWith('screen:'))
          || sources[0];
      }
      if (!chosen) {
        callback({});
        return;
      }
      const payload = { video: chosen };
      if (process.platform === 'win32') {
        payload.audio = 'loopback';
      }
      callback(payload);
    } catch { callback({}); }
  });

  // Register slide:// protocol handler
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient('slide', process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('slide');
  }

  // Global shortcut: Ctrl+Shift+S → toggle window visibility
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });

  createSplashWindow();
  mainWindow = await createMainWindow();
  createTray();

  // Check for app updates on launch (skip in dev)
  if (!isDev) {
    checkForUpdates().catch(() => {});
  }

  // macOS: re-show when clicking dock icon
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow();
      mainWindow = await createMainWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // Second instance: focus existing window + handle protocol URL
  app.on('second-instance', (_, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
    const protocolUrl = argv.find(a => a.startsWith('slide://'));
    if (protocolUrl) safeSend(mainWindow, 'protocol-url', protocolUrl);
  });

  // macOS open-url (from OS or other apps)
  app.on('open-url', (event, protocolUrl) => {
    event.preventDefault();
    mainWindow?.show(); mainWindow?.focus();
    safeSend(mainWindow, 'protocol-url', protocolUrl);
  });
});

app.on('before-quit', (e) => {
  // Clean up speaking animation interval
  if (speakingAnimInterval) { clearInterval(speakingAnimInterval); speakingAnimInterval = null; }

  // First time: notify renderer to leave voice, then quit after a short delay
  if (!app.isQuitting) {
    app.isQuitting = true;
    e.preventDefault();
    safeSend(mainWindow, 'app-before-quit');
    setTimeout(() => app.quit(), 300);
    return;
  }
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Window controls ─────────────────────────────────────────────────────
ipcMain.handle('set-launch-at-startup', (_, enabled) => {
  const settings = {
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: [],
  };
  // On Windows, also set openAsHidden so the app starts minimized to tray
  if (process.platform === 'win32') {
    settings.openAsHidden = false;
    // Use name for the registry entry
    settings.name = 'Slide';
  }
  app.setLoginItemSettings(settings);
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('get-launch-at-startup', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('flash-frame', () => mainWindow?.flashFrame(true));
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('set-always-on-top', (_, flag) => { mainWindow?.setAlwaysOnTop(flag); return flag; });

// ─── IPC: Tray / minimize-to-tray ────────────────────────────────────────────
ipcMain.handle('set-minimize-to-tray', (_, enabled) => {
  minimizeToTray = !!enabled;
  savePersistedSetting('minimizeToTray', minimizeToTray);
  return minimizeToTray;
});
ipcMain.handle('get-minimize-to-tray', () => minimizeToTray);

// ─── IPC: Voice tray state ───────────────────────────────────────────────────
// state: 'idle' | 'call' | 'speaking' | 'muted'
ipcMain.on('tray-voice-state', (_, state) => {
  updateTrayVoiceState(state);
});

// ─── IPC: Notifications ───────────────────────────────────────────────────────
ipcMain.handle('show-notification', (_, { title, body, icon } = {}) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({
    title: title || 'Slide',
    body: body || '',
    icon: icon || path.join(__dirname, '../public/icon.png'),
  });
  n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
  n.show();
  return true;
});

// ─── IPC: Badge / unread count ────────────────────────────────────────────────
ipcMain.handle('set-badge-count', (_, data) => {
  updateBadge(data);
  return currentBadgeCount;
});

// ─── IPC: Power save blocker ─────────────────────────────────────────────────
ipcMain.handle('power-save-block', () => {
  if (powerSaveId === null || !powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveId = powerSaveBlocker.start('prevent-display-sleep');
  }
  return true;
});
ipcMain.handle('power-save-unblock', () => {
  if (powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveBlocker.stop(powerSaveId);
    powerSaveId = null;
  }
  return false;
});
ipcMain.handle('get-power-save-status', () =>
  powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId)
);

// ─── IPC: File dialogs ────────────────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async (_, opts = {}) => {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    properties: opts.properties || ['openFile', 'multiSelections'],
    filters: opts.filters || [],
    title: opts.title || 'Sélectionner un fichier',
  });
  return result.canceled ? null : result.filePaths;
});
ipcMain.handle('save-file-dialog', async (_, opts = {}) => {
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    defaultPath: opts.defaultPath,
    filters: opts.filters || [],
    title: opts.title || 'Enregistrer le fichier',
  });
  return result.canceled ? null : result.filePath;
});

// ─── IPC: Desktop sources (screen share picker) ───────────────────────────────
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
    display_id: s.display_id,
  }));
});
ipcMain.handle('set-desktop-source', (_, sourceId) => { pendingSourceId = sourceId; });

// ─── IPC: System power ────────────────────────────────────────────────────────
ipcMain.handle('system-reboot',   async () => runSystemCommand('reboot'));
ipcMain.handle('system-shutdown', async () => runSystemCommand('shutdown'));
ipcMain.handle('system-sleep',    async () => runSystemCommand('sleep'));
ipcMain.handle('app-restart', () => { app.isQuitting = true; app.relaunch(); app.exit(0); });

// ─── IPC: Shell / misc ────────────────────────────────────────────────────────
ipcMain.handle('open-external', (_, targetUrl) => {
  if (/^https?:\/\//i.test(targetUrl)) shell.openExternal(targetUrl);
});
ipcMain.handle('show-item-in-folder', (_, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-path', (_, name) => {
  const allowed = ['home', 'appData', 'userData', 'downloads', 'desktop', 'pictures', 'videos', 'music', 'documents', 'temp'];
  if (!allowed.includes(name)) throw new Error(`Invalid path name: ${name}`);
  return app.getPath(name);
});

// ─── IPC: Secure key-value storage (encrypted on disk via safeStorage) ────────
const SECURE_STORE_FILE = () => path.join(app.getPath('userData'), 'slide-secure.dat');

function readSecureStore() {
  try {
    const raw = fs.readFileSync(SECURE_STORE_FILE(), 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}

function writeSecureStore(data) {
  try {
    fs.writeFileSync(SECURE_STORE_FILE(), JSON.stringify(data), 'utf8');
  } catch (_) {}
}

ipcMain.handle('secure-store-get', (_, key) => {
  try {
    const store = readSecureStore();
    const encoded = store[key];
    if (!encoded) return null;
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    }
    // Fallback: base64 obfuscation (no OS keychain available)
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch { return null; }
});

ipcMain.handle('secure-store-set', (_, key, value) => {
  try {
    const store = readSecureStore();
    if (safeStorage.isEncryptionAvailable()) {
      store[key] = safeStorage.encryptString(value).toString('base64');
    } else {
      store[key] = Buffer.from(value, 'utf8').toString('base64');
    }
    writeSecureStore(store);
    return true;
  } catch { return false; }
});

ipcMain.handle('secure-store-delete', (_, key) => {
  try {
    const store = readSecureStore();
    delete store[key];
    writeSecureStore(store);
    return true;
  } catch { return false; }
});

ipcMain.handle('secure-store-clear', () => {
  try {
    writeSecureStore({});
    return true;
  } catch { return false; }
});
