import React, { memo, useCallback } from 'react';
import { Camera, Paperclip } from 'lucide-react';
import Avatar from './Avatar';
import { useLanguage } from '../context/LanguageContext';
import './PinnedMessages.css';

const PinnedMessages = memo(function PinnedMessages({ 
  pinnedMessages = [], 
  onClose, 
  onScrollToMessage,
  onUnpin 
}) {
  const { t } = useLanguage();
  
  const handleMessageClick = useCallback((msg) => {
    if (onScrollToMessage) {
      onScrollToMessage(msg.id);
      onClose?.();
    }
  }, [onScrollToMessage, onClose]);

  return (
    <div className="pinned-messages-panel">
      <div className="pinned-messages-header">
        <h3 className="pinned-messages-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
          </svg>
          {t('pinned.title')}
          {pinnedMessages.length > 0 && (
            <span className="pinned-count">({pinnedMessages.length})</span>
          )}
        </h3>
        <button className="pinned-messages-close" onClick={onClose} title={t('common.close')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div className="pinned-messages-list">
        {pinnedMessages.length === 0 ? (
          <div className="pinned-messages-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
            </svg>
            <p>Aucun message épinglé</p>
            <span>Faites clic droit sur un message pour l'épingler</span>
          </div>
        ) : (
          pinnedMessages.map((msg) => (
            <div 
              key={msg.id} 
              className="pinned-message-item"
              onClick={() => handleMessageClick(msg)}
            >
              <div className="pinned-message-header">
                <Avatar user={msg.sender} size="small" />
                <span className="pinned-message-author">{msg.sender?.display_name || t('chat.user')}</span>
                <time className="pinned-message-time">
                  {new Date(msg.created_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </time>
              </div>
              <div className="pinned-message-content">
                {msg.type === 'text' ? (
                  <p>{msg.content?.length > 150 ? msg.content.substring(0, 150) + '...' : msg.content}</p>
                ) : msg.type === 'image' ? (
                  <span className="pinned-message-media"><Camera size={16} /> {t('chat.image')}</span>
                ) : (
                  <span className="pinned-message-media"><Paperclip size={16} /> {t('chat.file')}</span>
                )}
              </div>
              <div className="pinned-message-footer">
                <span className="pinned-by">
                  {t('pinned.by')} {msg.pinned_by_name}
                </span>
                {onUnpin && (
                  <button 
                    className="pinned-message-unpin"
                    onClick={(e) => { e.stopPropagation(); onUnpin(msg); }}
                    title={t('chat.unpin')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export default PinnedMessages;
