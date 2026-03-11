import React from 'react';
import './MobileBottomNav.css';

/* Icons for 3-tab nav: Home (DMs + servers via bar), Notifications, You */
const IconHome = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>
);

const IconNotifications = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

const IconYou = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

/* Home = DMs (Slide icon) + servers (server bar). Notifications. You. */
const TABS = [
  { id: 'home', label: 'Accueil', Icon: IconHome },
  { id: 'notifications', label: 'Notifications', Icon: IconNotifications },
  { id: 'profile', label: 'Vous', Icon: IconYou },
];

export default function MobileBottomNav({ activeTab, onTabChange, unreadCounts = {}, userAvatar }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Navigation principale">
      {TABS.map(({ id, label, Icon }) => {
        const count = unreadCounts[id] || 0;
        const isProfile = id === 'profile';
        return (
          <button
            key={id}
            className={`mbn-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <span className="mbn-icon-wrap">
              {isProfile && userAvatar ? (
                <img src={userAvatar} alt="" className="mbn-profile-avatar" />
              ) : (
                <Icon />
              )}
              {count > 0 && !isProfile && (
                <span className="mbn-badge">{count > 99 ? '99+' : count}</span>
              )}
            </span>
            <span className="mbn-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
