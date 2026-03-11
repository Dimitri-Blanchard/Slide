import React from 'react';
import { createPortal } from 'react-dom';
import { useNotification } from '../context/NotificationContext';
import './Notifications.css';

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
);

const WarningIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

export default function Notifications() {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  const content = (
    <div className="notifications-container">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className={`notification notification-${notif.type}`}
          onClick={() => removeNotification(notif.id)}
        >
          <div className="notification-icon">
            {notif.type === 'success' && <CheckIcon />}
            {notif.type === 'error' && <XIcon />}
            {notif.type === 'warning' && <WarningIcon />}
            {notif.type === 'info' && <InfoIcon />}
          </div>
          <span className="notification-message">{notif.message}</span>
          {(notif.count || 1) > 1 && (
            <span className="notification-count-badge">x{notif.count}</span>
          )}
        </div>
      ))}
    </div>
  );

  return createPortal(content, document.body);
}
