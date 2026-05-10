import React, { memo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { emojiToShortcode, shortcodeToEmoji } from '../utils/emojiShortcodes';
import { emojiToAranjaUrl } from '../utils/emojiAranja';
import { getRecentEmojis, saveRecentEmoji } from './StickerPicker';
import './MessageMobileActionSheet.css';

function SheetRow({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      className={`message-action-sheet-row${danger ? ' message-action-sheet-row--danger' : ''}`}
      onClick={onClick}
    >
      <span className="message-action-sheet-row-icon" aria-hidden>{icon}</span>
      <span className="message-action-sheet-row-label">{label}</span>
    </button>
  );
}

const MessageMobileActionSheet = memo(function MessageMobileActionSheet({
  msg,
  isOwn,
  reactions,
  currentUserId,
  messageSurface,
  onClose,
  onReply,
  onForward,
  onCopyText,
  onMarkUnread,
  onOpenEmojiPicker,
  onMessageUser,
  onInsertMention,
  onCopyMessageLink,
  onCopyMessageId,
  onReport,
  onEdit,
  onDelete,
  onPin,
  onUnpin,
  isPinned,
  onViewAllReactions,
  onToggleReaction,
  t,
}) {
  const tx = (key, fallback) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const sheetElRef = useRef(null);
  const grabActiveRef = useRef(false);
  const grabStartYRef = useRef(0);
  const dragYRef = useRef(0);

  const endGrab = useCallback(() => {
    if (!grabActiveRef.current) return;
    grabActiveRef.current = false;
    const d = dragYRef.current;
    dragYRef.current = 0;
    if (sheetElRef.current) sheetElRef.current.style.transform = '';
    if (d > 88) onClose();
  }, [onClose]);

  const onGrabPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    grabActiveRef.current = true;
    grabStartYRef.current = e.clientY;
    dragYRef.current = 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onGrabPointerMove = useCallback((e) => {
    if (!grabActiveRef.current) return;
    const dy = Math.max(0, e.clientY - grabStartYRef.current);
    dragYRef.current = dy;
    if (sheetElRef.current) {
      sheetElRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
      if (dy > 2) sheetElRef.current.classList.add('is-dragging');
    }
  }, []);

  const onGrabPointerUp = useCallback(
    (e) => {
      if (sheetElRef.current) sheetElRef.current.classList.remove('is-dragging');
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      endGrab();
    },
    [endGrab]
  );

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const normEmoji = (e) => emojiToShortcode(e || '');
  const recent = getRecentEmojis().slice(0, 12);

  const canMessageUser =
    (messageSurface?.kind === 'server' || (messageSurface?.kind === 'dm' && messageSurface.isGroup)) &&
    !isOwn &&
    msg?.sender_id &&
    String(msg.sender_id) !== String(currentUserId) &&
    !msg.is_webhook &&
    !msg.sender?.is_webhook;

  const showCopyLink = messageSurface?.kind === 'server' || messageSurface?.kind === 'dm';
  const mentionUsername = msg.sender?.username;
  const showMention = !!mentionUsername && !isOwn;

  const run = (fn) => () => {
    fn?.();
    onClose();
  };

  const iconReply = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
  const iconForward = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 14 20 9 15 4" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
  const iconCopy = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
  const iconUnread = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
  const iconReact = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
  const iconMessage = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
  const iconAt = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
  const iconLink = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
  const iconHash = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
  const iconEdit = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
  const iconPin = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
  const iconUnpin = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
  const iconTrash = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
  const iconReport = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );

  return createPortal(
    <div className="message-action-sheet-layer" role="dialog" aria-modal="true" aria-label={tx('chat.messageActions', 'Message actions')}>
      <button type="button" className="message-action-sheet-backdrop" onClick={onClose} aria-label={tx('common.close', 'Close')} />
      <div ref={sheetElRef} className="message-action-sheet">
        <div
          className="message-action-sheet-grab"
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
          onPointerCancel={onGrabPointerUp}
          role="presentation"
        />
        <div className="message-action-sheet-quick-label">{tx('chat.quickReactions', 'Quick reactions')}</div>
        <div className="message-action-sheet-quick-row">
          {recent.map((shortcode) => {
            const emojiChar = shortcodeToEmoji(shortcode);
            const aranjaUrl = emojiToAranjaUrl(emojiChar);
            const existing = reactions?.find((r) => normEmoji(r.emoji) === normEmoji(shortcode));
            const hasReacted = existing?.userIds?.includes(currentUserId) || false;
            return (
              <button
                key={shortcode}
                type="button"
                className={`message-action-sheet-emoji-btn${hasReacted ? ' active' : ''}`}
                aria-label={emojiChar}
                onClick={run(() => {
                  saveRecentEmoji(shortcode);
                  onToggleReaction?.(msg.id, existing?.emoji ?? shortcode, hasReacted);
                })}
              >
                {aranjaUrl ? <img src={aranjaUrl} alt="" /> : emojiChar}
              </button>
            );
          })}
          <button
            type="button"
            className="message-action-sheet-emoji-btn message-action-sheet-emoji-btn--more"
            aria-label={t('chat.react')}
            onClick={() => {
              onOpenEmojiPicker?.();
              onClose();
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        </div>

        <div className="message-action-sheet-scroll">
          {onReply && <SheetRow label={t('chat.reply')} icon={iconReply} onClick={run(() => onReply(msg))} />}
          {onForward && <SheetRow label={t('chat.forward')} icon={iconForward} onClick={run(() => onForward(msg))} />}
          {onCopyText && <SheetRow label={t('chat.copyText')} icon={iconCopy} onClick={run(() => onCopyText(msg))} />}

          {onMarkUnread && (
            <SheetRow
              label={t('chat.markUnread')}
              icon={iconUnread}
              onClick={run(() => onMarkUnread(msg))}
            />
          )}

          {onOpenEmojiPicker && (
            <SheetRow
              label={t('chat.react')}
              icon={iconReact}
              onClick={() => {
                onOpenEmojiPicker();
                onClose();
              }}
            />
          )}

          {canMessageUser && onMessageUser && (
            <SheetRow
              label={t('chat.messageUser')}
              icon={iconMessage}
              onClick={run(() => onMessageUser(msg))}
            />
          )}

          {showMention && onInsertMention && (
            <SheetRow
              label={t('chat.mentionUser')}
              icon={iconAt}
              onClick={run(() => onInsertMention(msg, mentionUsername))}
            />
          )}

          {showCopyLink && onCopyMessageLink && (
            <SheetRow label={t('chat.copyMessageLink')} icon={iconLink} onClick={run(() => onCopyMessageLink(msg))} />
          )}

          {onCopyMessageId && (
            <SheetRow label={t('chat.copyMessageId')} icon={iconHash} onClick={run(() => onCopyMessageId(msg))} />
          )}

          {Array.isArray(reactions) && reactions.length > 0 && onViewAllReactions && (
            <SheetRow
              label={tx('chat.viewAllReactions', 'All reactions')}
              icon={iconReact}
              onClick={run(() => onViewAllReactions(msg))}
            />
          )}

          {(msg.type === 'text' || msg.type === 'image' || msg.type === 'file') &&
            isOwn &&
            !msg.is_webhook &&
            !msg.sender?.is_webhook &&
            onEdit && <SheetRow label={t('chat.edit')} icon={iconEdit} onClick={run(() => onEdit(msg))} />}

          {isPinned && onUnpin && (
            <SheetRow label={t('chat.unpin')} icon={iconUnpin} onClick={run(() => onUnpin(msg))} />
          )}
          {!isPinned && onPin && (
            <SheetRow label={t('chat.pin')} icon={iconPin} onClick={run(() => onPin(msg))} />
          )}

          {onDelete && (isOwn || messageSurface?.kind === 'dm') && (
            <SheetRow label={t('chat.delete')} icon={iconTrash} danger onClick={run(() => onDelete(msg))} />
          )}

          {!isOwn && onReport && !msg.is_webhook && !msg.sender?.is_webhook && (
            <SheetRow label={t('chat.report')} icon={iconReport} danger onClick={run(() => onReport(msg))} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});

export default MessageMobileActionSheet;
