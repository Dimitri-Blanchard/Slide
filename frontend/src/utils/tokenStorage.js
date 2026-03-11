/**
 * Persistent token storage.
 * - Capacitor: Uses @capacitor/preferences (native storage, survives app updates, more reliable than WebView localStorage)
 * - Electron/Web: Uses localStorage
 * On Capacitor startup, we restore from Preferences into localStorage so the rest of the app works unchanged.
 */

const TOKEN_KEY = 'slide_token';
const REFRESH_TOKEN_KEY = 'slide_refresh_token';
const DEVICE_ID_KEY = 'slide_device_id';
const DEVICE_NAME_KEY = 'slide_device_name';
const ACCOUNTS_KEY = 'slide_accounts';
const MAX_ACCOUNTS = 5;

function idsEqual(a, b) {
  return String(a) === String(b);
}

function sanitizeLegacyHandle(value) {
  return String(value || '')
    .replace(/(\s+|#)0*\s*$/, '')
    .replace(/(?<![0-9])0\s*$/, '')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeLegacyDisplayName(displayName, username) {
  const raw = String(displayName || '').trim();
  if (!raw) return raw;
  const handle = sanitizeLegacyHandle(username);
  if (handle && new RegExp(`^${escapeRegExp(handle)}(?:\\s*#?\\s*0+)?$`, 'i').test(raw)) {
    return handle;
  }
  return raw;
}

function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const userId = raw.userId ?? raw.user_id ?? raw.id ?? null;
  const token = raw.token ?? raw.accessToken ?? raw.authToken ?? raw.jwt ?? null;
  if (userId == null || !token) return null;
  return {
    userId,
    username: sanitizeLegacyHandle(raw.username || raw.handle || ''),
    displayName: sanitizeLegacyDisplayName(raw.displayName || raw.display_name || raw.name || '', raw.username || raw.handle || ''),
    token,
    avatar_url: raw.avatar_url || raw.avatarUrl || null,
  };
}

// ═══════════════════════════════════════════════════════════
// CONSOLE LOGGING FOR USER SYSTEM (developer debugging - no sensitive data)
// ═══════════════════════════════════════════════════════════
const STORAGE_LOG_PREFIX = '[Auth:Storage]';
function storageLog(action, details = {}) {
  console.info(`${STORAGE_LOG_PREFIX} ${action}`, details);
}

let isCapacitor = false;
let initPromise = null;

async function init() {
  if (initPromise) return initPromise;
  if (typeof window === 'undefined') return;
  try {
    const cap = window.Capacitor;
    isCapacitor = !!(cap?.isNativePlatform?.());
    if (isCapacitor) {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: TOKEN_KEY });
      if (value) {
        localStorage.setItem(TOKEN_KEY, value);
        storageLog('init — restored token from Capacitor Preferences', { fixHint: 'tokenStorage.js init()' });
      }
    }
  } catch (e) {
    console.warn(`${STORAGE_LOG_PREFIX} init failed`, { error: e?.message, fixHint: 'Capacitor Preferences unavailable. Check @capacitor/preferences.' });
  }
  initPromise = Promise.resolve();
  return initPromise;
}

/**
 * Restore token from native storage on app cold start. Call this before any auth checks.
 * @returns {Promise<string|null>} The restored token if any
 */
export async function restoreToken() {
  await init();
  // Electron: restore token from secure encrypted storage first
  if (typeof window !== 'undefined' && window.electron?.secureGet) {
    try {
      const secureToken = await window.electron.secureGet(TOKEN_KEY);
      if (secureToken) {
        localStorage.setItem(TOKEN_KEY, secureToken);
        storageLog('restoreToken — restored from Electron secure storage');
        return secureToken;
      }
    } catch (_) {}
  }
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get token (sync). Must call restoreToken() at app startup on Capacitor first.
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Set token. Persists to both localStorage and Capacitor Preferences when applicable.
 */
export async function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
  storageLog('setToken — token stored', { length: token?.length, isCapacitor });
  // Electron: also persist in OS-encrypted secure storage
  if (typeof window !== 'undefined' && window.electron?.secureSet) {
    try { await window.electron.secureSet(TOKEN_KEY, token); } catch (_) {}
  }
  if (isCapacitor) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: TOKEN_KEY, value: token });
    } catch (e) {
      console.warn(`${STORAGE_LOG_PREFIX} setToken Capacitor sync failed`, { error: e?.message });
    }
  }
}

/**
 * Get or create a stable device ID for this browser/device.
 * Used for 2FA grace period and device session management.
 */
export function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'd_' + (crypto.randomUUID?.()?.replace(/-/g, '') ??
      Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join(''));
    localStorage.setItem(DEVICE_ID_KEY, id);
    storageLog('getOrCreateDeviceId — new device ID created', { idPrefix: id.slice(0, 6) + '…', fixHint: 'Used for 2FA grace period, device sessions.' });
  }
  return id;
}

function parseDeviceNameFromUserAgent() {
  if (typeof navigator === 'undefined') return null;
  const ua = String(navigator.userAgent || '');
  if (!ua) return null;

  // Android often exposes model before "Build/...".
  const android = ua.match(/Android\s+[\d.]+;\s*([^;)]+?)\s+Build\//i);
  if (android?.[1]) return android[1].trim();

  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';

  if (typeof window !== 'undefined' && window.electron?.isElectron) {
    const plat = window.electron?.platform || 'desktop';
    return `Slide Desktop (${plat})`;
  }

  return null;
}

/**
 * Best-effort device name for session labeling.
 * Examples: "Samsung Galaxy S25", "SM-S938B", "90UU009KMZ".
 */
export async function getDeviceName() {
  if (typeof window === 'undefined') return null;

  const cached = localStorage.getItem(DEVICE_NAME_KEY);
  if (cached && cached.trim()) return cached.trim();

  let resolved = null;
  const isNative = !!window.Capacitor?.isNativePlatform?.();

  if (isNative) {
    try {
      const { Device } = await import('@capacitor/device');
      const info = await Device.getInfo();
      const model = info?.model?.trim();
      const name = info?.name?.trim();
      // Prefer model/name coming from the OS.
      resolved = model || name || null;
    } catch (_) {
      // Optional plugin path; fallback to user-agent parsing below.
    }
  }

  if (!resolved) {
    resolved = parseDeviceNameFromUserAgent();
  }

  if (!resolved) return null;
  localStorage.setItem(DEVICE_NAME_KEY, resolved);
  return resolved;
}

/**
 * Get saved accounts for multi-account switching.
 * @returns {Array<{userId: number, username: string, displayName: string, token: string, avatar_url?: string}>}
 */
export function getAccounts() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map(normalizeAccount)
      .filter(Boolean)
      .slice(0, MAX_ACCOUNTS);
    // Keep storage in the latest shape once we read old entries.
    const wasDifferent =
      normalized.length !== parsed.length ||
      normalized.some((acc, i) => {
        const prev = parsed[i];
        return !prev || prev.userId !== acc.userId || prev.token !== acc.token;
      });
    if (wasDifferent) {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return [];
  }
}

/**
 * Add or update an account in the saved accounts list.
 * @param {{id: number, username?: string, display_name?: string, avatar_url?: string}} user
 * @param {string} token
 */
export function addAccount(user, token) {
  if (typeof window === 'undefined' || !user?.id || !token) return;
  const accounts = getAccounts();
  const entry = {
    userId: user.id,
    username: sanitizeLegacyHandle(user.username || ''),
    displayName: sanitizeLegacyDisplayName(user.display_name || '', user.username || ''),
    token,
    avatar_url: user.avatar_url || null,
  };
  const filtered = accounts.filter((a) => !idsEqual(a.userId, user.id));
  const updated = [entry, ...filtered].slice(0, MAX_ACCOUNTS);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
  storageLog('addAccount', { userId: user.id, count: updated.length });
}

/**
 * Remove an account from the saved list.
 * @param {number} userId
 */
export function removeAccount(userId) {
  if (typeof window === 'undefined') return;
  const accounts = getAccounts().filter((a) => !idsEqual(a.userId, userId));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  storageLog('removeAccount', { userId });
}

/**
 * Get token for a saved account.
 * @param {number} userId
 * @returns {string|null}
 */
export function getAccountToken(userId) {
  const accounts = getAccounts();
  const acc = accounts.find((a) => idsEqual(a.userId, userId));
  return acc?.token ?? null;
}

/**
 * Clear device ID. Call when device was revoked so next login gets a fresh one.
 */
export function clearDeviceId() {
  if (typeof window === 'undefined') return;
  storageLog('clearDeviceId — device ID cleared (e.g. device revoked)', { fixHint: 'Next 2FA login will get fresh device. api.js 401 DEVICE_REVOKED.' });
  localStorage.removeItem(DEVICE_ID_KEY);
}

/**
 * Clear token. Removes from both storages.
 */
export async function clearToken() {
  storageLog('clearToken — token removed', { isCapacitor });
  localStorage.removeItem(TOKEN_KEY);
  if (typeof window !== 'undefined' && window.electron?.secureDelete) {
    try { await window.electron.secureDelete(TOKEN_KEY); } catch (_) {}
  }
  if (isCapacitor) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: TOKEN_KEY });
    } catch (e) {
      console.warn(`${STORAGE_LOG_PREFIX} clearToken Capacitor sync failed`, { error: e?.message });
    }
  }
}

// ─── Refresh token ────────────────────────────────────────────────────────────

/**
 * Get stored refresh token. Prefers Electron secure storage.
 */
export async function getRefreshToken() {
  if (typeof window !== 'undefined' && window.electron?.secureGet) {
    try {
      const val = await window.electron.secureGet(REFRESH_TOKEN_KEY);
      if (val) return val;
    } catch (_) {}
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY) || null;
}

/**
 * Store refresh token. Uses Electron secure storage when available.
 */
export async function setRefreshToken(token) {
  if (!token) return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
  if (typeof window !== 'undefined' && window.electron?.secureSet) {
    try { await window.electron.secureSet(REFRESH_TOKEN_KEY, token); } catch (_) {}
  }
}

/**
 * Clear refresh token from all storages.
 */
export async function clearRefreshToken() {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  if (typeof window !== 'undefined' && window.electron?.secureDelete) {
    try { await window.electron.secureDelete(REFRESH_TOKEN_KEY); } catch (_) {}
  }
}
