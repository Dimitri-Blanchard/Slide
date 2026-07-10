/**
 * Emoji shortcode utilities. App uses :shortcode: format internally for easier management.
 * Stored/transmitted as :grinning: :heart: etc., always displayed as actual emoji.
 *
 * @see https://www.npmjs.com/package/node-emoji
 */
import * as emoji from 'node-emoji';
import { lib as emojilib } from 'emojilib';

/** :upsidedownface: → :upside_down_face: (Discord-style names without underscores) */
let compactShortcodeMap = null;

function getCompactShortcodeMap() {
  if (compactShortcodeMap) return compactShortcodeMap;
  compactShortcodeMap = new Map();
  for (const name of Object.keys(emojilib)) {
    const compact = name.replace(/[_-]/g, '').toLowerCase();
    if (!compactShortcodeMap.has(compact)) compactShortcodeMap.set(compact, name);
  }
  return compactShortcodeMap;
}

function normalizeCompactShortcodes(text) {
  return text.replace(/:([a-zA-Z][a-zA-Z0-9_+-]*):/g, (match, name) => {
    if (emoji.has(name)) return match;
    const resolved = getCompactShortcodeMap().get(name.replace(/[_-]/g, '').toLowerCase());
    return resolved ? `:${resolved}:` : match;
  });
}

/**
 * Convert Unicode emoji to shortcode (:name:).
 * Pass-through if already a shortcode (e.g. :grinning:).
 * @param {string} emojiChar - Unicode emoji (e.g. '😀') or shortcode
 * @returns {string} Shortcode (e.g. ':grinning:') or original if no mapping
 */
export function emojiToShortcode(emojiChar) {
  if (!emojiChar || typeof emojiChar !== 'string') return emojiChar;
  if (emojiChar.startsWith(':') && emojiChar.endsWith(':')) return emojiChar;
  const shortcode = emoji.which(emojiChar, { markdown: true });
  return shortcode != null ? shortcode : emojiChar;
}

/**
 * Convert shortcode to Unicode emoji.
 * @param {string} shortcode - Shortcode (e.g. ':grinning:' or 'grinning')
 * @returns {string} Unicode emoji or original if no mapping
 */
export function shortcodeToEmoji(shortcode) {
  if (!shortcode || typeof shortcode !== 'string') return shortcode;
  const normalized = shortcode.startsWith(':') && shortcode.endsWith(':')
    ? shortcode
    : `:${shortcode}:`;
  const result = emoji.emojify(normalized, { fallback: normalized });
  return result !== normalized ? result : shortcode;
}

/**
 * Convert all shortcodes in text to Unicode emojis for display.
 */
export function emojifyText(text) {
  if (!text || typeof text !== 'string') return text;
  const normalized = normalizeCompactShortcodes(text);
  return emoji.emojify(normalized, { fallback: (m) => m });
}

/**
 * Convert all Unicode emojis in text to shortcodes for storage.
 */
export function unemojifyText(text) {
  if (!text || typeof text !== 'string') return text;
  return emoji.unemojify(text);
}
