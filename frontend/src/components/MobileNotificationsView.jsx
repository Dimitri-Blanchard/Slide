import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import './MobileNotificationsView.css';

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

const MobileNotificationsView = memo(function MobileNotificationsView() {
  const { inboxItems, clearInbox } = useNotification();
  const navigate = useNavigate();

  const handleItemClick = (item) => {
    if (item.channelPath) {
      navigate(item.channelPath);
    }
  };

  return (
    <div className="mobile-notifications-view">
      <div className="mobile-notifications-header">
        <h1 className="mobile-notifications-title">Notifications</h1>
        {inboxItems.length > 0 && (
          <button
            className="mobile-notifications-clear"
            onClick={clearInbox}
            type="button"
          >
            Tout marquer lu
          </button>
        )}
      </div>

      <div className="mobile-notifications-body">
        {inboxItems.length === 0 ? (
          <div className="mobile-notifications-empty">
            <div className="mobile-notifications-empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <p>Tout est à jour !</p>
            <span>Les mentions et réponses apparaîtront ici.</span>
          </div>
        ) : (
          <div className="mobile-notifications-list">
            {inboxItems.map((item) => (
              <button
                key={item.id}
                className="mobile-notification-item"
                onClick={() => handleItemClick(item)}
                type="button"
              >
                <div className="mobile-notification-meta">
                  <span className="mobile-notification-channel">
                    {item.channelName ? `#${item.channelName}` : item.conversationName || 'Message direct'}
                  </span>
                  <span className="mobile-notification-time">{formatRelativeTime(item.timestamp)}</span>
                </div>
                <div className="mobile-notification-sender">{item.senderName}</div>
                <p className="mobile-notification-preview">{item.preview}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default MobileNotificationsView;
