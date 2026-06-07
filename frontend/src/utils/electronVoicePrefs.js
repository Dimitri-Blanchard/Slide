/**
 * Local voice preferences for the Electron app (persists across restarts).
 * Primary store: userData/voice-prefs.json (sync IPC).
 * Mirror: localStorage for fast reads in the renderer.
 */

const STORAGE_KEY = 'slide_electron_voice_prefs';
const STORAGE_VERSION = 1;

export const ELECTRON_VOICE_SETTING_KEYS = [
  'input_device',
  'output_device',
  'video_device',
  'input_volume',
  'output_volume',
  'screen_share_capture_volume',
  'input_sensitivity',
  'echo_cancellation',
  'noise_suppression',
  'auto_gain_control',
];

export function isElectronVoicePrefsEnabled() {
  return typeof window !== 'undefined' && !!window.electron?.isElectron;
}

function readLocalStorageRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalStorageRaw(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...data }));
  } catch (err) {
    console.warn('Failed to mirror Electron voice prefs in localStorage:', err);
  }
}

function readDiskRaw() {
  if (!isElectronVoicePrefsEnabled() || !window.electron?.getVoicePrefsSync) return null;
  try {
    const data = window.electron.getVoicePrefsSync();
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function writeDiskRaw(data) {
  if (!isElectronVoicePrefsEnabled() || !window.electron?.setVoicePrefsSync) return false;
  try {
    return window.electron.setVoicePrefsSync(data) !== false;
  } catch {
    return false;
  }
}

function readStoredRaw() {
  if (!isElectronVoicePrefsEnabled()) return null;
  const disk = readDiskRaw();
  const local = readLocalStorageRaw();
  if (disk && local) {
    const diskTime = disk.savedAt || 0;
    const localTime = local.savedAt || 0;
    return diskTime >= localTime ? disk : local;
  }
  return disk || local;
}

function writeStoredRaw(data) {
  if (!isElectronVoicePrefsEnabled()) return;
  const payload = { version: STORAGE_VERSION, savedAt: Date.now(), ...data };
  writeDiskRaw(payload);
  writeLocalStorageRaw(payload);
}

export function pickVoiceSettings(settings) {
  if (!settings || typeof settings !== 'object') return {};
  const out = {};
  for (const key of ELECTRON_VOICE_SETTING_KEYS) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

export function loadElectronVoicePrefs() {
  const raw = readStoredRaw();
  if (!raw) return null;
  const hasSettings = raw.settings && Object.keys(pickVoiceSettings(raw.settings)).length > 0;
  const hasMuteState = raw.isMuted === true || raw.isDeafened === true;
  if (!hasSettings && !hasMuteState) return null;
  return {
    settings: pickVoiceSettings(raw.settings || {}),
    isMuted: raw.isMuted === true,
    isDeafened: raw.isDeafened === true,
  };
}

function readStoredRecord() {
  return readStoredRaw() || { version: STORAGE_VERSION, settings: {} };
}

export function saveElectronVoicePrefs(partial) {
  if (!isElectronVoicePrefsEnabled()) return;
  const prev = readStoredRecord();
  const next = {
    settings: { ...pickVoiceSettings(prev.settings || {}), ...(partial.settings ? pickVoiceSettings(partial.settings) : {}) },
    isMuted: partial.isMuted !== undefined ? !!partial.isMuted : prev.isMuted === true,
    isDeafened: partial.isDeafened !== undefined ? !!partial.isDeafened : prev.isDeafened === true,
  };
  writeStoredRaw(next);
}

export function saveElectronVoiceSettings(settings) {
  const picked = pickVoiceSettings(settings);
  if (Object.keys(picked).length === 0) return;
  const prev = readStoredRecord();
  writeStoredRaw({
    settings: { ...pickVoiceSettings(prev.settings || {}), ...picked },
    isMuted: prev.isMuted === true,
    isDeafened: prev.isDeafened === true,
  });
}

/** Synchronous save — safe before window unload / app quit. */
export function saveElectronVoiceMuteState(isMuted, isDeafened) {
  if (!isElectronVoicePrefsEnabled()) return;
  const prev = readStoredRecord();
  writeStoredRaw({
    settings: pickVoiceSettings(prev.settings || {}),
    isMuted: !!isMuted,
    isDeafened: !!isDeafened,
  });
}

export function persistElectronVoiceMuteFromRefs(isMutedRef, isDeafenedRef) {
  saveElectronVoiceMuteState(!!isMutedRef?.current, !!isDeafenedRef?.current);
}
