/**
 * Utilities for contenteditable inputs that display Aranja emoji images.
 * App uses :shortcode: format internally. data-emoji stores shortcode.
 *
 * - getContent: extract text with shortcodes from contenteditable
 * - setContent: set content, converting shortcodes to Aranja img tags
 * - insertEmoji: insert img for shortcode (e.g. :grinning:)
 */

import { createAranjaEmojiSpan } from './inlineAranjaEmoji';
import { shortcodeToEmoji } from './emojiShortcodes';
import { renderComposerContent } from './contentEditableFormat';

let composerMutationDepth = 0;

/** True while setContent/refreshComposer is updating the DOM (ignore spurious input events). */
export function isMutatingComposer() {
  return composerMutationDepth > 0;
}

function runComposerMutation(fn) {
  composerMutationDepth += 1;
  try {
    return fn();
  } finally {
    composerMutationDepth -= 1;
  }
}

function isEmojiNode(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && node.tagName === 'SPAN'
    && node.dataset?.emoji
    && node.classList?.contains('input-inline-emoji');
}

function createEmojiNode(shortcode, emojiChar) {
  return createAranjaEmojiSpan(emojiChar, {
    className: 'input-inline-emoji',
    shortcode,
  });
}

/**
 * Extract plain text from contenteditable. Emoji nodes with data-emoji → shortcode.
 */
export function getContent(editable) {
  if (!editable) return '';
  let s = '';
  function walk(node, isRoot) {
    if (node.nodeType === Node.TEXT_NODE) {
      s += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (isEmojiNode(node)) {
        s += node.dataset.emoji;
      } else if (node.tagName === 'BR') {
        s += '\n';
      } else {
        const isBlock = !isRoot && (node.tagName === 'DIV' || node.tagName === 'P');
        if (isBlock && s.length > 0) s += '\n';
        for (const c of node.childNodes) walk(c, false);
      }
    }
  }
  walk(editable, true);
  return s.replace(/\n$/, '');
}

/**
 * Set contenteditable content with live markdown + emoji formatting.
 */
export function setContent(editable, text) {
  if (!editable) return;
  runComposerMutation(() => {
    editable.innerHTML = '';
    if (!text) return;
    editable.appendChild(renderComposerContent(text));
  });
}

/** Re-read plain text, re-apply formatting, restore cursor. Returns plain text. */
export function refreshComposer(editable) {
  if (!editable) return '';
  const offset = getCursorOffset(editable);
  const content = getContent(editable);
  setContent(editable, content);
  setCursorAtOffset(editable, Math.min(offset, content.length));
  return content;
}

/**
 * Insert Aranja emoji img at current selection/cursor.
 */
export function insertEmoji(editable, shortcode) {
  if (!editable) return;
  const emojiChar = shortcodeToEmoji(shortcode);
  if (!emojiChar || emojiChar === shortcode) return;
  const node = createEmojiNode(shortcode, emojiChar);
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  if (!range || !editable.contains(range.commonAncestorContainer)) {
    editable.appendChild(node);
    editable.focus();
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

/** Get text before cursor (for @ mention detection etc). */
export function getTextBeforeCursor(editable) {
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  if (!range || !editable) return '';
  const full = getContent(editable);
  const offset = getCursorOffset(editable);
  return full.substring(0, offset);
}

/** Get character offset of cursor from start of content */
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
      if (isEmojiNode(n)) {
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

/** Set cursor at character offset (plain-text offset matching getContent). */
export function setCursorAtOffset(editable, offset) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let count = 0;
  let placed = false;

  function walk(n) {
    if (placed) return;
    if (n.nodeType === Node.TEXT_NODE) {
      const len = n.length;
      if (count + len >= offset) {
        range.setStart(n, Math.min(offset - count, len));
        range.collapse(true);
        placed = true;
        return;
      }
      count += len;
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    if (isEmojiNode(n)) {
      const len = n.dataset.emoji.length;
      if (count + len >= offset) {
        if (offset > count) range.setStartAfter(n);
        else range.setStartBefore(n);
        range.collapse(true);
        placed = true;
        return;
      }
      count += len;
      return;
    }
    if (n.tagName === 'BR') {
      if (count + 1 >= offset) {
        if (offset > count) range.setStartAfter(n);
        else range.setStartBefore(n);
        range.collapse(true);
        placed = true;
        return;
      }
      count += 1;
      return;
    }
    for (const c of n.childNodes) walk(c);
  }

  for (const c of editable.childNodes) walk(c);
  if (!placed) {
    range.selectNodeContents(editable);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

const BLOCK_COPY_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);

function isDisplayEmojiNode(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && node.tagName === 'SPAN'
    && node.classList?.contains('message-inline-emoji');
}

function emojiNodeCopyText(node) {
  if (isEmojiNode(node)) {
    const sc = node.dataset.emoji;
    return shortcodeToEmoji(sc) || sc || node.getAttribute('aria-label') || node.textContent || '';
  }
  if (isDisplayEmojiNode(node)) {
    return node.getAttribute('aria-label') || node.textContent || '';
  }
  return null;
}

function nodesToCopyText(nodes) {
  let s = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      s += node.textContent;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const emojiText = emojiNodeCopyText(node);
    if (emojiText !== null) {
      s += emojiText;
      return;
    }
    if (node.tagName === 'BR') {
      s += '\n';
      return;
    }
    const isBlock = BLOCK_COPY_TAGS.has(node.tagName);
    if (isBlock && s.length > 0 && !s.endsWith('\n')) s += '\n';
    for (const c of node.childNodes) walk(c);
  };
  for (const n of nodes) walk(n);
  return s;
}

function selectionContainsEmojiNodes(range) {
  const fragment = range.cloneContents();
  return !!fragment.querySelector?.(
    'span.message-inline-emoji, span.input-inline-emoji, span[data-emoji]'
  );
}

/** Plain text for the current selection, with emoji images converted to Unicode. */
export function getSelectionCopyText(root) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  if (root) {
    const rootEl = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
    if (rootEl && !rootEl.contains(ancestor)) return null;
  }
  return nodesToCopyText(range.cloneContents().childNodes);
}

/** Copy handler: include emoji images as Unicode in clipboard text. */
export function handleEmojiAwareCopy(e, root) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  if (root) {
    const rootEl = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
    if (rootEl && !rootEl.contains(ancestor)) return;
  }

  const isEditable = root?.isContentEditable;
  const hasEmojis = selectionContainsEmojiNodes(range);
  if (!isEditable && !hasEmojis) return;

  const text = getSelectionCopyText(root);
  if (text == null) return;

  e.preventDefault();
  e.clipboardData.setData('text/plain', text);
}
