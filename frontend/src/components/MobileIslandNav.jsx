import React from 'react';
import { createPortal } from 'react-dom';
import MobileSidebarUserBar from './MobileSidebarUserBar';
import './MobileIslandNav.css';

export default function MobileIslandNav({
  activeTab,
  onTabChange,
  notificationCount = 0,
  pendingFriendsCount = 0,
}) {
  const isNotificationsActive = activeTab === 'notifications';

  const handleNotificationsClick = () => {
    if (isNotificationsActive) {
      onTabChange('home');
    } else {
      onTabChange('notifications');
    }
  };

  return createPortal(
    <nav className="mobile-island-nav" aria-label="Navigation principale">
      <div className="min-island-shell">
        <MobileSidebarUserBar
          notificationCount={notificationCount}
          isNotificationsActive={isNotificationsActive}
          onNotificationsClick={handleNotificationsClick}
          pendingFriendsCount={pendingFriendsCount}
        />
      </div>
    </nav>,
    document.body
  );
}
