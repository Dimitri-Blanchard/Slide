import React, { memo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import './InboxPanel.css';

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const InboxPanel = memo(function InboxPanel({ onClose }) {
  const { inboxItems, clearInbox } = useNotification();
  const navigate = useNavigate();
  const panelRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleItemClick = (item) => {
    if (item.channelPath) {
      navigate(item.channelPath);
    }
    onClose();
  };

  return (
    <>
      <div className="inbox-backdrop" onClick={onClose} />
      <div className="inbox-panel" ref={panelRef} role="dialog" aria-label="Inbox">
        <div className="inbox-header">
          <h3 className="inbox-title">Inbox</h3>
          <div className="inbox-header-actions">
            {inboxItems.length > 0 && (
              <button className="inbox-clear-btn" onClick={clearInbox} title="Mark all read">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                </svg>
              </button>
            )}
            <button className="inbox-close-btn" onClick={onClose} aria-label="Close inbox">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="inbox-body">
          {inboxItems.length === 0 ? (
            <div className="inbox-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <p>You're all caught up!</p>
              <span>Mentions and replies will appear here.</span>
            </div>
          ) : (
            <div className="inbox-list">
              {inboxItems.map((item) => (
                <button
                  key={item.id}
                  className="inbox-item"
                  onClick={() => handleItemClick(item)}
                >
                  <div className="inbox-item-meta">
                    <span className="inbox-item-channel">
                      {item.channelName ? `#${item.channelName}` : item.conversationName || 'Direct Message'}
                    </span>
                    <span className="inbox-item-time">{formatRelativeTime(item.timestamp)}</span>
                  </div>
                  <div className="inbox-item-sender">{item.senderName}</div>
                  <p className="inbox-item-preview">{item.preview}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
});

export default InboxPanel;
