import React, { memo, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Paperclip } from 'lucide-react';
import Avatar from './Avatar';
import { useLanguage } from '../context/LanguageContext';
import './PinnedMessages.css';

function formatPinnedTime(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const PinnedMessages = memo(function PinnedMessages({
  pinnedMessages = [],
  onClose,
  onScrollToMessage,
  anchorRef,
}) {
  const { t } = useLanguage();
  const [panelPos, setPanelPos] = useState({ top: -9999, right: 12, ready: false });

  const updatePanelPos = useCallback(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
      ready: true,
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    updatePanelPos();
    window.addEventListener('resize', updatePanelPos);
    window.addEventListener('scroll', updatePanelPos, true);
    return () => {
      window.removeEventListener('resize', updatePanelPos);
      window.removeEventListener('scroll', updatePanelPos, true);
    };
  }, [updatePanelPos]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (anchorRef?.current?.contains(e.target)) return;
      if (e.target.closest?.('.pinned-messages-panel')) return;
      onClose?.();
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, anchorRef]);

  const handleMessageClick = useCallback((msg) => {
    if (onScrollToMessage) {
      onScrollToMessage(msg.id);
      onClose?.();
    }
  }, [onScrollToMessage, onClose]);

  const panel = (
    <div
      className="pinned-messages-panel pinned-messages-panel--portal"
      style={{
        top: panelPos.top,
        right: panelPos.right,
        visibility: panelPos.ready ? 'visible' : 'hidden',
      }}
    >
      <div className="pinned-messages-header">
        <h3 className="pinned-messages-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
          </svg>
          {t('pinned.title')}
        </h3>
      </div>

      <div className="pinned-messages-list">
        {pinnedMessages.length === 0 ? (
          <div className="pinned-messages-empty">
            <p>{t('pinned.empty')}</p>
            <span>{t('pinned.hint')}</span>
          </div>
        ) : (
          pinnedMessages.map((msg) => (
            <div
              key={msg.id}
              className="pinned-message-item"
              onClick={() => handleMessageClick(msg)}
            >
              <div className="pinned-message-avatar">
                <Avatar user={msg.sender} size="small" />
              </div>
              <div className="pinned-message-body">
                <div className="pinned-message-meta">
                  <span className="pinned-message-author">{msg.sender?.display_name || t('chat.user')}</span>
                  <time className="pinned-message-time" dateTime={msg.created_at}>
                    {formatPinnedTime(msg.created_at)}
                  </time>
                </div>
                <div className="pinned-message-bubble">
                  {msg.type === 'text' ? (
                    <p>{msg.content}</p>
                  ) : msg.type === 'image' ? (
                    <span className="pinned-message-media"><Camera size={14} /> {t('chat.image')}</span>
                  ) : (
                    <span className="pinned-message-media"><Paperclip size={14} /> {t('chat.file')}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
});

export default PinnedMessages;
