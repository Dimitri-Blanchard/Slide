import { emojiToAranjaUrl } from './emojiAranja';

/**
 * Inline emoji as a text character + ::before background image.
 * Unicode stays in the DOM so text selection flows naturally (no contenteditable=false).
 */
export function createAranjaEmojiSpan(emojiChar, options = {}) {
  const {
    className = 'message-inline-emoji',
    shortcode,
    contentEditable = undefined,
  } = options;

  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', emojiChar);
  span.textContent = emojiChar;
  if (shortcode) span.dataset.emoji = shortcode;

  const url = emojiToAranjaUrl(emojiChar);
  if (url) span.style.setProperty('--emoji-url', `url("${url}")`);

  if (contentEditable === false) span.setAttribute('contenteditable', 'false');
  return span;
}

export function aranjaEmojiStyle(url) {
  return url ? { '--emoji-url': `url("${url}")` } : undefined;
}
