/**
 * Generate a deterministic key fingerprint for the Security Dashboard.
 * In a full E2EE implementation this would derive from the user's Signal identity key.
 * Here we create a stable, verifiable fingerprint from user identity for display and QR verification.
 */
const SALT = 'slide-e2ee-fingerprint-v1';

/**
 * SHA-256 hash of input string, returns hex string.
 */
async function sha256Hex(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Format fingerprint as human-readable groups (Signal-style: ABCD EF12 3456 ...)
 */
export function formatFingerprint(hex) {
  const upper = hex.toUpperCase();
  const groups = [];
  for (let i = 0; i < upper.length; i += 4) {
    groups.push(upper.slice(i, i + 4));
  }
  return groups.join(' ');
}

/**
 * Generate a deterministic fingerprint for the user.
 * @param {{ id: number|string, username?: string }} user - User object with id and username
 * @returns {Promise<string>} Formatted fingerprint string
 */
export async function generateFingerprint(user) {
  if (!user?.id) return '';
  const username = (user.username || user.display_name || String(user.id)).toLowerCase();
  const input = `${SALT}:${user.id}:${username}`;
  const hex = await sha256Hex(input);
  return formatFingerprint(hex.slice(0, 60)); // 15 groups of 4 = 60 chars
}

/**
 * Build the verification payload for QR code scanning.
 * Another Slide client can scan this to verify identity.
 */
export function buildVerificationPayload(user, fingerprint) {
  const payload = {
    v: 1,
    type: 'slide-verify',
    id: String(user.id),
    username: user.username || '',
    displayName: user.display_name || '',
    fp: fingerprint.replace(/\s/g, ''),
    ts: Math.floor(Date.now() / 1000),
  };
  return `slide://verify?data=${encodeURIComponent(JSON.stringify(payload))}`;
}
