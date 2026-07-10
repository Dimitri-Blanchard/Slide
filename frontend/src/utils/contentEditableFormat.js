/**
 * Live markdown formatting for the message composer (Discord-style).
 * Delimiters render muted only when part of a complete pair; inner text is styled.
 */

import { splitTextByEmoji } from './emojiAranja';
import { emojifyText, unemojifyText } from './emojiShortcodes';
import { createAranjaEmojiSpan } from './inlineAranjaEmoji';

const EMOJI_SHORTCODE_RE = /:([a-zA-Z][a-zA-Z0-9_+-]*):/g;

// Inline emphasis only — no code blocks, mentions, or block headers in composer
const COMPOSER_MD_REGEX = /`([^`\n]+)`|\|\|([\s\S]+?)\|\||\*\*\*(.+?)\*\*\*|~~(.+?)~~|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)([^_\n]+?)(?<!_)_(?!_)/g;

function maskShortcodes(text) {
  const tokens = [];
  const masked = text.replace(EMOJI_SHORTCODE_RE, (match) => {
    const id = tokens.length;
    tokens.push(match);
    return `\uE000${id}\uE001`;
  });
  return { masked, tokens };
}

function unmaskSegment(str, tokens) {
  if (!str || !tokens.length) return str;
  return str.replace(/\uE000(\d+)\uE001/g, (_, i) => tokens[Number(i)] ?? '');
}

function createSyntaxNode(text) {
  const span = document.createElement('span');
  span.className = 'input-md-syntax';
  span.textContent = text;
  return span;
}

function createEmojiNode(shortcode, emojiChar) {
  return createAranjaEmojiSpan(emojiChar, {
    className: 'input-inline-emoji',
    shortcode,
  });
}

function appendText(text, parent) {
  if (text) parent.appendChild(document.createTextNode(text));
}

function wrapFormatted(open, close, inner, parent, tag, className) {
  parent.appendChild(createSyntaxNode(open));
  const el = document.createElement(tag);
  if (className) el.className = className;
  appendRichInline(inner, el);
  parent.appendChild(el);
  parent.appendChild(createSyntaxNode(close));
}

/** Parse nested markdown + emojis inside a formatted region. */
function appendRichInline(text, parent) {
  const normalized = emojifyText(text);
  const segments = splitTextByEmoji(normalized);
  for (const seg of segments) {
    if (seg.type === 'text') {
      appendMarkdownText(seg.value, parent);
    } else {
      const shortcode = unemojifyText(seg.value);
      parent.appendChild(createEmojiNode(shortcode, seg.value));
    }
  }
}

function appendMarkdownText(text, parent) {
  if (!text) return;
  const { masked, tokens } = maskShortcodes(text);
  let lastIndex = 0;
  let match;
  const re = new RegExp(COMPOSER_MD_REGEX.source, 'g');
  while ((match = re.exec(masked)) !== null) {
    if (match.index > lastIndex) {
      appendText(unmaskSegment(masked.substring(lastIndex, match.index), tokens), parent);
    }
    if (match[1] !== undefined) {
      wrapFormatted('`', '`', unmaskSegment(match[1], tokens), parent, 'code', 'input-md-code');
    } else if (match[2] !== undefined) {
      wrapFormatted('||', '||', unmaskSegment(match[2], tokens), parent, 'span', 'input-md-spoiler');
    } else if (match[3] !== undefined) {
      parent.appendChild(createSyntaxNode('***'));
      const strong = document.createElement('strong');
      const em = document.createElement('em');
      appendRichInline(unmaskSegment(match[3], tokens), em);
      strong.appendChild(em);
      parent.appendChild(strong);
      parent.appendChild(createSyntaxNode('***'));
    } else if (match[4] !== undefined) {
      wrapFormatted('~~', '~~', unmaskSegment(match[4], tokens), parent, 'del', null);
    } else if (match[5] !== undefined) {
      wrapFormatted('**', '**', unmaskSegment(match[5], tokens), parent, 'strong', null);
    } else if (match[6] !== undefined) {
      wrapFormatted('__', '__', unmaskSegment(match[6], tokens), parent, 'em', null);
    } else if (match[7] !== undefined) {
      wrapFormatted('*', '*', unmaskSegment(match[7], tokens), parent, 'em', null);
    } else if (match[8] !== undefined) {
      wrapFormatted('_', '_', unmaskSegment(match[8], tokens), parent, 'em', null);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < masked.length) {
    appendText(unmaskSegment(masked.substring(lastIndex), tokens), parent);
  }
}

function appendInlineContent(text, parent) {
  appendRichInline(text, parent);
}

/** Build DOM fragment with live markdown + emoji formatting for the composer. */
export function renderComposerContent(text) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) frag.appendChild(document.createElement('br'));
    appendInlineContent(lines[i], frag);
  }
  return frag;
}
