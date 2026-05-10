/**
 * Utilities for contenteditable inputs that display Aranja emoji images.
 * App uses :shortcode: format internally. data-emoji stores shortcode.
 *
 * - getContent: extract text with shortcodes from contenteditable
 * - setContent: set content, converting shortcodes to Aranja img tags
 * - insertEmoji: insert img for shortcode (e.g. :grinning:)
 */

import { splitTextByEmoji } from './emojiAranja';
import { emojiToAranjaUrl } from './emojiAranja';
import { shortcodeToEmoji, emojifyText, unemojifyText } from './emojiShortcodes';

/**
 * Extract plain text from contenteditable. Img with data-emoji → shortcode (e.g. :grinning:).
 */
export function getContent(editable) {
  if (!editable) return '';
  let s = '';
  function walk(node, isRoot) {
    if (node.nodeType === Node.TEXT_NODE) {
      s += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'IMG' && node.dataset.emoji) {
        s += node.dataset.emoji;
      } else if (node.tagName === 'BR') {
        s += '\n';
      } else {
        // Block elements (DIV, P) that are not the root get a leading newline
        // but only if there's already content (avoids leading newline on first block)
        const isBlock = !isRoot && (node.tagName === 'DIV' || node.tagName === 'P');
        if (isBlock && s.length > 0) s += '\n';
        for (const c of node.childNodes) walk(c, false);
      }
    }
  }
  // Walk editable itself as root so its direct children are not treated as root
  walk(editable, true);
  // Strip trailing newline that browsers often append
  return s.replace(/\n$/, '');
}

/**
 * Set contenteditable content. Converts shortcodes to Aranja img elements.
 * Plain Unicode emojis in text are normalized to shortcodes in data-emoji.
 */
export function setContent(editable, text) {
  if (!editable) return;
  editable.innerHTML = '';
  if (!text) return;
  const normalized = emojifyText(text);
  const segments = splitTextByEmoji(normalized);
  for (const seg of segments) {
    if (seg.type === 'text') {
      // Split on newlines and insert <br> elements
      const lines = seg.value.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) editable.appendChild(document.createTextNode(lines[i]));
        if (i < lines.length - 1) editable.appendChild(document.createElement('br'));
      }
    } else {
      const shortcode = unemojifyText(seg.value);
      const url = emojiToAranjaUrl(seg.value);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = seg.value;
        img.dataset.emoji = shortcode;
        img.className = 'input-inline-emoji';
        img.setAttribute('contenteditable', 'false');
        editable.appendChild(img);
      } else {
        editable.appendChild(document.createTextNode(seg.value));
      }
    }
  }
}

/**
 * Insert Aranja emoji img at current selection/cursor.
 * @param {HTMLElement} editable
 * @param {string} shortcode - e.g. ':grinning:' or ':heart:'
 */
export function insertEmoji(editable, shortcode) {
  if (!editable) return;
  const emojiChar = shortcodeToEmoji(shortcode);
  const url = emojiToAranjaUrl(emojiChar);
  if (!url) return;
  const img = document.createElement('img');
  img.src = url;
  img.alt = emojiChar;
  img.dataset.emoji = shortcode;
  img.className = 'input-inline-emoji';
  img.setAttribute('contenteditable', 'false');
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  if (!range || !editable.contains(range.commonAncestorContainer)) {
    editable.appendChild(img);
    editable.focus();
    return;
  }
  range.deleteContents();
  range.insertNode(img);
  range.setStartAfter(img);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  editable.focus();
}

/** Insert plain text at selection; used for @mentions in the composer. */
export function insertPlainTextAtCursor(editable, text) {
  if (!editable || text == null || text === '') return;
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  const node = document.createTextNode(text);
  if (!range || !editable.contains(range.commonAncestorContainer)) {
    editable.appendChild(node);
    editable.focus();
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    return;
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  editable.focus();
}

/**
 * Get text before cursor (for @ mention detection etc).
 * Includes img data-emoji as in getContent.
 */
export function getTextBeforeCursor(editable) {
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  if (!range || !editable) return '';
  const full = getContent(editable);
  const offset = getCursorOffset(editable);
  return full.substring(0, offset);
}

/**
 * Get character offset of cursor from start of content
 */
export function getCursorOffset(editable) {
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  if (!range || !editable) return 0;
  const endNode = range.startContainer;
  const endOffset = range.startOffset;
  if (!editable.contains(endNode) && endNode !== editable) return 0;
  let count = 0;
  function walk(n, stopAtNode, stopAtOffset) {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = (n === stopAtNode) ? stopAtOffset : n.length;
      count += len;
      return n === stopAtNode;
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      if (n.tagName === 'IMG' && n.dataset.emoji) {
        if (n === stopAtNode) return true;
        count += n.dataset.emoji.length;
        return false;
      }
      if (n.tagName === 'BR') {
        if (n === stopAtNode) return true;
        count += 1;
        return false;
      }
      for (const c of n.childNodes) {
        if (walk(c, stopAtNode, stopAtOffset)) return true;
      }
    }
    return false;
  }
  if (endNode === editable) {
    for (let i = 0; i < endOffset && i < editable.childNodes.length; i++) {
      walk(editable.childNodes[i], null, null);
    }
  } else {
    for (const c of editable.childNodes) {
      if (walk(c, endNode, endOffset)) break;
    }
  }
  return count;
}

/**
 * Set cursor at character offset
 */
export function setCursorAtOffset(editable, offset) {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
  let current = 0;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.nodeType === Node.TEXT_NODE ? node.length : (node.dataset.emoji?.length || 1);
    if (current + len >= offset) {
      const range = document.createRange();
      if (node.nodeType === Node.TEXT_NODE) {
        range.setStart(node, Math.min(offset - current, node.length));
      } else {
        if (offset > current) {
          range.setStartAfter(node);
        } else {
          range.setStartBefore(node);
        }
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    current += len;
  }
  const endRange = document.createRange();
  endRange.selectNodeContents(editable);
  endRange.collapse(false);
  sel.removeAllRanges();
  sel.addRange(endRange);
}
