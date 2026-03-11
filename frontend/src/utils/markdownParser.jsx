import React, { useEffect, useRef, useState } from 'react';
import { processTextWithAranjaEmojis } from './emojiAranja';

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

// Groups: 1=codeblock, 2=inlinecode, 3=spoiler, 4=bold-italic***, 5=strike, 6=bold**, 7=bold__, 8=italic*, 9=italic_, 10=mention
export const MD_REGEX = /```([\s\S]*?)```|`([^`\n]+)`|\|\|([\s\S]+?)\|\||\*\*\*(.+?)\*\*\*|~~(.+?)~~|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)([^_\n]+?)(?<!_)_(?!_)|@(everyone|channel|[\w\s]+?)(?=[\s.,!?]|$)/g;

// Detect if a string contains any markdown formatting
export const HAS_MARKDOWN_RE = /```|`[^`\n]|\|\|[^|]|~~[^~]|\*\*[^*]|\*[^*\s]|__[^_]|_[^_\s]|^#{1,3} |^-# |^> /m;

const MESSAGE_URL_RE = /https?:\/\/[^\s<>'"]+/g;

function processPlainTextWithAranja(text, keyRef) {
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
      nodes.push(<img key={keyRef.current++} src={p.url} alt={p.alt} className="message-inline-emoji" />);
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
  const parts = [];
  let lastIndex = 0;
  const keyRef = { current: baseKey };
  let match;
  const re = new RegExp(MD_REGEX.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...processPlainTextWithAranja(text.substring(lastIndex, match.index), keyRef));
    }
    if (match[1] !== undefined) {
      const codeContent = match[1].trim();
      parts.push(<MarkdownCodeBlock key={keyRef.current++} code={codeContent} />);
    } else if (match[2] !== undefined) {
      parts.push(<code key={keyRef.current++} className="md-code">{match[2]}</code>);
    } else if (match[3] !== undefined) {
      parts.push(<Spoiler key={keyRef.current++}>{match[3]}</Spoiler>);
    } else if (match[4] !== undefined) {
      parts.push(<strong key={keyRef.current++}><em>{match[4]}</em></strong>);
    } else if (match[5] !== undefined) {
      parts.push(<del key={keyRef.current++}>{match[5]}</del>);
    } else if (match[6] !== undefined) {
      parts.push(<strong key={keyRef.current++}>{match[6]}</strong>);
    } else if (match[7] !== undefined) {
      parts.push(<strong key={keyRef.current++}>{match[7]}</strong>);
    } else if (match[8] !== undefined) {
      parts.push(<em key={keyRef.current++}>{match[8]}</em>);
    } else if (match[9] !== undefined) {
      parts.push(<em key={keyRef.current++}>{match[9]}</em>);
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
  if (lastIndex < text.length) {
    parts.push(...processPlainTextWithAranja(text.substring(lastIndex), keyRef));
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
