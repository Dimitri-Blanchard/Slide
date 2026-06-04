/**
 * Local voice preferences for the Electron app (persists across restarts).
 * Stored in localStorage under userData partition.
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

function readRaw() {
  if (!isElectronVoicePrefsEnabled()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRaw(data) {
  if (!isElectronVoicePrefsEnabled()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...data }));
  } catch (err) {
    console.warn('Failed to save Electron voice prefs:', err);
  }
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
  const raw = readRaw();
  if (!raw) return null;
  return {
    settings: pickVoiceSettings(raw.settings || raw),
    isMuted: raw.isMuted === true,
    isDeafened: raw.isDeafened === true,
  };
}

export function saveElectronVoicePrefs(partial) {
  if (!isElectronVoicePrefsEnabled()) return;
  const prev = loadElectronVoicePrefs() || { settings: {}, isMuted: false, isDeafened: false };
  const next = {
    settings: { ...prev.settings, ...(partial.settings ? pickVoiceSettings(partial.settings) : {}) },
    isMuted: partial.isMuted !== undefined ? !!partial.isMuted : prev.isMuted,
    isDeafened: partial.isDeafened !== undefined ? !!partial.isDeafened : prev.isDeafened,
  };
  writeRaw(next);
}

export function saveElectronVoiceSettings(settings) {
  const picked = pickVoiceSettings(settings);
  if (Object.keys(picked).length === 0) return;
  saveElectronVoicePrefs({ settings: picked });
}

export function saveElectronVoiceMuteState(isMuted, isDeafened) {
  saveElectronVoicePrefs({ isMuted: !!isMuted, isDeafened: !!isDeafened });
}
