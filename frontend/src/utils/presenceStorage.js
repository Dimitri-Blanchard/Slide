const ONLINE_STATUS_KEY = 'slide_online_status';
const CUSTOM_STATUS_KEY = 'slide_custom_status';

function userScopedKey(baseKey, userId) {
  if (userId === undefined || userId === null || userId === '') return baseKey;
  return `${baseKey}:${userId}`;
}

function readString(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const value = localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeString(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

export function getStoredOnlineStatus(userId) {
  return readString(userScopedKey(ONLINE_STATUS_KEY, userId), 'online');
}

export function setStoredOnlineStatus(userId, status) {
  writeString(userScopedKey(ONLINE_STATUS_KEY, userId), status || 'online');
}

export function getStoredCustomStatus(userId) {
  return readString(userScopedKey(CUSTOM_STATUS_KEY, userId), '');
}

export function setStoredCustomStatus(userId, status) {
  writeString(userScopedKey(CUSTOM_STATUS_KEY, userId), status || '');
}
