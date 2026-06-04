const NOTE_STORAGE_KEY = 'slide_profile_notes';

const legacyNoteKey = (uid) => `slide_user_note_${uid}`;

function normalizeUserId(uid) {
  return uid == null ? '' : String(uid);
}

/** Private note for a user (visible only to you). Shared across profile card, detail modal, context menu. */
export function loadUserNote(uid) {
  const id = normalizeUserId(uid);
  if (!id) return '';
  try {
    const store = JSON.parse(localStorage.getItem(NOTE_STORAGE_KEY) || '{}');
    const value = store[id];
    if (value != null && String(value).trim() !== '') return String(value);
  } catch {
    /* ignore */
  }
  try {
    const legacy = localStorage.getItem(legacyNoteKey(id));
    if (legacy && legacy.trim()) {
      saveUserNote(id, legacy);
      return legacy.trim();
    }
  } catch {
    /* ignore */
  }
  return '';
}

export function saveUserNote(uid, note) {
  const id = normalizeUserId(uid);
  if (!id) return;
  const trimmed = typeof note === 'string' ? note.trim() : '';
  try {
    const store = JSON.parse(localStorage.getItem(NOTE_STORAGE_KEY) || '{}');
    if (trimmed) store[id] = trimmed;
    else delete store[id];
    localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(store));
    localStorage.removeItem(legacyNoteKey(id));
    window.dispatchEvent(
      new CustomEvent('slide:user-note-changed', { detail: { userId: id, note: trimmed } })
    );
  } catch {
    /* ignore */
  }
}
