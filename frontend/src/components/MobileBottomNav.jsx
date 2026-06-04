import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { hapticSelection } from '../utils/nativeHaptics';
import AppIcon from './icons/AppIcon';
import './MobileBottomNav.css';

/* Home = DMs (Slide icon) + servers (server bar). Notifications. You. */
const TABS = [
  { id: 'home', labelKey: 'mobile.home', fallback: 'Home', icon: 'home' },
  { id: 'notifications', labelKey: 'notifications.title', fallback: 'Notifications', icon: 'notification' },
  { id: 'profile', labelKey: 'mobile.you', fallback: 'You', icon: 'user' },
];

export default function MobileBottomNav({ activeTab, onTabChange, unreadCounts = {}, userAvatar }) {
  const { t } = useLanguage();
  return (
    <nav className="mobile-bottom-nav" aria-label="Navigation principale">
      {TABS.map(({ id, labelKey, fallback, icon }) => {
        const translated = t(labelKey);
        const label = translated === labelKey ? fallback : translated;
        const count = unreadCounts[id] || 0;
        const isProfile = id === 'profile';
        return (
          <button
            key={id}
            className={`mbn-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => {
              if (activeTab !== id) hapticSelection();
              onTabChange(id);
            }}
            aria-label={label}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <span className="mbn-icon-wrap">
              {isProfile && userAvatar ? (
                <img src={userAvatar} alt="" className="mbn-profile-avatar" />
              ) : (
                <AppIcon name={icon} size={24} />
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
