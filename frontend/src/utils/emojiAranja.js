/**
 * Utilities for using emoji.aranja.com PNG emojis.
 * @see https://emoji.aranja.com/
 *
 * URL format: https://emoji.aranja.com/emojis/{vendor}/{codepoint}.png
 * Vendors: apple, google, twitter, facebook
 * Codepoint: lowercase hex, multi-codepoint joined with hyphens (e.g. 1f469-200d-2764-fe0f)
 *
 * Supports both Unicode emojis and :shortcode: format (converted before processing).
 */

import { emojifyText } from './emojiShortcodes';

const ARANJA_BASE = 'https://emoji.aranja.com/emojis';
const DEFAULT_VENDOR = 'twitter';

/**
 * Convert a Unicode emoji to its codepoint string for aranja URLs.
 * Examples: "😀" → "1f600", "❤️" → "2764-fe0f", "👩‍❤️‍👨" → "1f469-200d-2764-fe0f-200d-1f468"
 */
export function emojiToCodepoint(emoji) {
  if (!emoji || typeof emoji !== 'string') return null;
  const parts = [];
  for (let i = 0; i < emoji.length; ) {
    const cp = emoji.codePointAt(i);
    if (cp != null) {
      parts.push(cp.toString(16).toLowerCase());
      i += cp > 0xffff ? 2 : 1;
    } else {
      i++;
    }
  }
  return parts.join('-') || null;
}

/**
 * Get the aranja.com image URL for a Unicode emoji.
 * @param {string} emoji - Unicode emoji character(s)
 * @param {string} [vendor='twitter'] - Vendor style: apple, google, twitter, facebook
 * @returns {string|null} - Image URL or null if conversion fails
 */
export function emojiToAranjaUrl(emoji, vendor = DEFAULT_VENDOR) {
  const codepoint = emojiToCodepoint(emoji);
  if (!codepoint) return null;
  return `${ARANJA_BASE}/${vendor}/${codepoint}.png`;
}

/**
 * Regex to match emoji sequences (including ZWJ sequences, modifiers, variation selectors).
 * Uses Unicode property \p{Extended_Pictographic} (ES2018+).
 */
const EMOJI_REGEX = /\p{Extended_Pictographic}(\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic}?)*/gu;

/**
 * Split text into segments (plain text and emoji). Returns array of { type: 'text'|'emoji', value }.
 */
export function splitTextByEmoji(text) {
  if (!text || typeof text !== 'string') return [];
  const segments = [];
  let lastIndex = 0;
  let match;
  EMOJI_REGEX.lastIndex = 0;
  while ((match = EMOJI_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'emoji', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

/**
 * Process a text segment: replace Unicode emojis (and :shortcode:) with Aranja image URLs.
 * Text may contain :shortcode: format – converted to Unicode before processing.
 * Returns array of React-friendly nodes (strings and { type, key, node } for imgs).
 */
export function processTextWithAranjaEmojis(text, vendor = DEFAULT_VENDOR) {
  if (!text || typeof text !== 'string') return [];
  const normalized = emojifyText(text);
  const segments = splitTextByEmoji(normalized);
  return segments.map((seg) => {
    if (seg.type === 'text') return seg.value;
    const url = emojiToAranjaUrl(seg.value, vendor);
    return url ? { type: 'img', url, alt: seg.value } : seg.value;
  });
}
