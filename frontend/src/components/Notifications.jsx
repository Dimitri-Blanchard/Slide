import React from 'react';
import { createPortal } from 'react-dom';
import { useNotification } from '../context/NotificationContext';
import './Notifications.css';

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
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
  const problemNotifications = notifications.filter((notif) => notif.type === 'error' || notif.type === 'warning');

  if (problemNotifications.length === 0) return null;

  const content = (
    <div className="problem-notices-container" aria-live="polite" aria-atomic="false">
      {problemNotifications.map((notif) => (
        <div
          key={notif.id}
          className={`problem-notice problem-notice-${notif.type}`}
          onClick={() => removeNotification(notif.id)}
          role="status"
        >
          <div className="problem-notice-icon">
            {notif.type === 'error' ? <XIcon /> : <WarningIcon />}
          </div>
          <span className="problem-notice-message">{notif.message}</span>
          {(notif.count || 1) > 1 && (
            <span className="problem-notice-count">x{notif.count}</span>
          )}
        </div>
      ))}
    </div>
  );

  return createPortal(content, document.body);
}
