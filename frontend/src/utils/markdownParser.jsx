import React, { useEffect, useRef, useState } from 'react';
import { processTextWithAranjaEmojis } from './emojiAranja';
import { emojifyText } from './emojiShortcodes';
import { aranjaEmojiStyle } from './inlineAranjaEmoji';

// ── Spoiler component ──────────────────────────────────────
export const Spoiler = function Spoiler({ children }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`md-spoiler${revealed ? ' md-spoiler-revealed' : ''}`}
      onClick={e => { e.stopPropagation(); setRevealed(r => !r); }}
      title={revealed ? '' : 'Click to reveal spoiler'}
    >
      {children}
    </span>
  );
};

function copyToClipboard(text) {
  if (!text) return Promise.resolve();
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function MarkdownCodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await copyToClipboard(code);
      setCopied(true);
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, 3000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <pre className="md-codeblock">
      <button
        type="button"
        className={`md-codeblock-copy${copied ? ' copied' : ''}`}
        onClick={handleCopy}
        title={copied ? 'Copied' : 'Copy code'}
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? (
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
            <rect x="9" y="9" width="10" height="10" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        )}
      </button>
      <code>{code}</code>
    </pre>
  );
}

// Groups: 1=codeblock, 2=inlinecode, 3=spoiler, 4=bold-italic***, 5=strike, 6=bold**, 7=italic__, 8=italic*, 9=italic_, 10=mention
export const MD_REGEX = /```([\s\S]*?)```|`([^`\n]+)`|\|\|([\s\S]+?)\|\||\*\*\*(.+?)\*\*\*|~~(.+?)~~|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)([^_\n]+?)(?<!_)_(?!_)|@(everyone|channel|[\w\s]+?)(?=[\s.,!?]|$)/g;

const BLOCK_MD_LINE_RE = /^(#{1,3} |-# |> )/;

export function hasTextFormatting(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.split('\n').some((line) => BLOCK_MD_LINE_RE.test(line))) return true;
  const re = new RegExp(MD_REGEX.source, 'g');
  return re.test(text);
}

const MESSAGE_URL_RE = /https?:\/\/[^\s<>'"]+/g;

function getUrlRanges(text) {
  const ranges = [];
  const re = new RegExp(MESSAGE_URL_RE.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

function overlapsUrl(start, end, urlRanges) {
  return urlRanges.some(({ start: s, end: e }) => start < e && end > s);
}

// Groups 3–9: spoiler, bold, italic, strike — not code blocks (1–2) or mentions (10).
function isEmphasisMarkdownMatch(match) {
  for (let i = 3; i <= 9; i++) {
    if (match[i] !== undefined) return true;
  }
  return false;
}

function renderEmphasisContent(text, keyRef, currentUserName, mentionUsers, onMentionClick) {
  if (!text) return null;
  const nodes = parseInlineMarkdown(text, currentUserName, keyRef.current, mentionUsers, onMentionClick);
  keyRef.current += 500;
  return nodes.length > 0 ? nodes : text;
}

function processPlainTextInline(text, keyRef) {
  const processed = processTextWithAranjaEmojis(text);
  const nodes = [];
  for (const p of processed) {
    if (typeof p === 'string') {
      MESSAGE_URL_RE.lastIndex = 0;
      let lastIndex = 0;
      let m;
      let hasUrls = false;
      while ((m = MESSAGE_URL_RE.exec(p)) !== null) {
        hasUrls = true;
        if (m.index > lastIndex) nodes.push(p.substring(lastIndex, m.index));
        const url = m[0];
        nodes.push(
          <a key={keyRef.current++} href={url} className="message-link" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
            {url}
          </a>
        );
        lastIndex = m.index + m[0].length;
      }
      if (hasUrls) {
        if (lastIndex < p.length) nodes.push(p.substring(lastIndex));
      } else {
        nodes.push(p);
      }
    } else {
      nodes.push(
        <span
          key={keyRef.current++}
          className="message-inline-emoji"
          role="img"
          aria-label={p.alt}
          style={aranjaEmojiStyle(p.url)}
        >
          {p.alt}
        </span>
      );
    }
  }
  return nodes.length > 0 ? nodes : [text];
}

export function resolveMentionUser(mentionName, mentionUsers) {
  if (!mentionUsers?.length || !mentionName) return null;
  const lower = mentionName.toLowerCase().trim();
  return mentionUsers.find(u =>
    (u.display_name && u.display_name.toLowerCase() === lower) ||
    (u.username && u.username.toLowerCase() === lower)
  ) || null;
}

export function parseInlineMarkdown(text, currentUserName = '', baseKey = 0, mentionUsers = [], onMentionClick = null) {
  if (!text) return [];
  // Resolve :shortcode: before markdown so underscores in names are not parsed as emphasis.
  const source = emojifyText(text);
  const parts = [];
  let lastIndex = 0;
  const keyRef = { current: baseKey };
  const urlRanges = getUrlRanges(source);
  let match;
  const re = new RegExp(MD_REGEX.source, 'g');
  while ((match = re.exec(source)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    if (isEmphasisMarkdownMatch(match) && overlapsUrl(matchStart, matchEnd, urlRanges)) continue;
    if (match.index > lastIndex) {
      parts.push(...processPlainTextInline(source.substring(lastIndex, match.index), keyRef));
    }
    if (match[1] !== undefined) {
      const codeContent = match[1].trim();
      parts.push(<MarkdownCodeBlock key={keyRef.current++} code={codeContent} />);
    } else if (match[2] !== undefined) {
      parts.push(<code key={keyRef.current++} className="md-code">{match[2]}</code>);
    } else if (match[3] !== undefined) {
      parts.push(<Spoiler key={keyRef.current++}>{renderEmphasisContent(match[3], keyRef, currentUserName, mentionUsers, onMentionClick)}</Spoiler>);
    } else if (match[4] !== undefined) {
      parts.push(<strong key={keyRef.current++}><em>{renderEmphasisContent(match[4], keyRef, currentUserName, mentionUsers, onMentionClick)}</em></strong>);
    } else if (match[5] !== undefined) {
      parts.push(<del key={keyRef.current++}>{renderEmphasisContent(match[5], keyRef, currentUserName, mentionUsers, onMentionClick)}</del>);
    } else if (match[6] !== undefined) {
      parts.push(<strong key={keyRef.current++}>{renderEmphasisContent(match[6], keyRef, currentUserName, mentionUsers, onMentionClick)}</strong>);
    } else if (match[7] !== undefined) {
      parts.push(<em key={keyRef.current++}>{renderEmphasisContent(match[7], keyRef, currentUserName, mentionUsers, onMentionClick)}</em>);
    } else if (match[8] !== undefined) {
      parts.push(<em key={keyRef.current++}>{renderEmphasisContent(match[8], keyRef, currentUserName, mentionUsers, onMentionClick)}</em>);
    } else if (match[9] !== undefined) {
      parts.push(<em key={keyRef.current++}>{renderEmphasisContent(match[9], keyRef, currentUserName, mentionUsers, onMentionClick)}</em>);
    } else if (match[10] !== undefined) {
      const mentionName = match[10];
      const isSpecial = mentionName === 'everyone' || mentionName === 'channel';
      const isMe = currentUserName && mentionName.toLowerCase() === currentUserName.toLowerCase();
      const mentionUser = !isSpecial ? resolveMentionUser(mentionName, mentionUsers) : null;
      const isClickable = !isSpecial && !!onMentionClick;
      parts.push(
        <span
          key={keyRef.current++}
          className={`mention${isMe || isSpecial ? ' mention-me' : ''}${isClickable ? ' mention-clickable' : ''}`}
          onClick={isClickable ? (e) => { e.stopPropagation(); onMentionClick(mentionUser || { username: mentionName }, e); } : undefined}
          role={isClickable ? 'button' : undefined}
        >
          @{mentionName}
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    parts.push(...processPlainTextInline(source.substring(lastIndex), keyRef));
  }
  return parts.length > 0 ? parts : [text];
}

export function parseMessageContent(text, currentUserName = '', mentionUsers = [], onMentionClick = null) {
  if (!text) return text;
  const result = [];
  let key = 0;
  const lines = text.split('\n');
  let lineBuffer = [];

  const flushBuffer = () => {
    if (!lineBuffer.length) return;
    const joined = lineBuffer.join('\n');
    lineBuffer = [];
    const parsed = parseInlineMarkdown(joined, currentUserName, key * 1000, mentionUsers, onMentionClick);
    key++;
    result.push(<React.Fragment key={key++}>{parsed}</React.Fragment>);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      flushBuffer();
      const c = parseInlineMarkdown(line.substring(4), currentUserName, key * 1000, mentionUsers, onMentionClick);
      result.push(<h3 key={key++} className="md-h3">{c}</h3>);
    } else if (line.startsWith('## ')) {
      flushBuffer();
      const c = parseInlineMarkdown(line.substring(3), currentUserName, key * 1000, mentionUsers, onMentionClick);
      result.push(<h2 key={key++} className="md-h2">{c}</h2>);
    } else if (line.startsWith('# ')) {
      flushBuffer();
      const c = parseInlineMarkdown(line.substring(2), currentUserName, key * 1000, mentionUsers, onMentionClick);
      result.push(<h1 key={key++} className="md-h1">{c}</h1>);
    } else if (line.startsWith('-# ')) {
      flushBuffer();
      const c = parseInlineMarkdown(line.substring(3), currentUserName, key * 1000, mentionUsers, onMentionClick);
      result.push(<span key={key++} className="md-subtext">{c}</span>);
    } else if (line.startsWith('> ')) {
      flushBuffer();
      const bqContent = parseInlineMarkdown(line.substring(2), currentUserName, key * 1000, mentionUsers, onMentionClick);
      key++;
      result.push(<blockquote key={key++} className="md-blockquote">{bqContent}</blockquote>);
    } else {
      lineBuffer.push(line);
    }
  }
  flushBuffer();
  return result.length > 0 ? result : text;
}
