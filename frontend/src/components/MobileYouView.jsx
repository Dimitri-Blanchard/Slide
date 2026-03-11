import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import { useAuth } from '../context/AuthContext';
import './MobileYouView.css';

const MobileYouView = memo(function MobileYouView({ onOpenSettings }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.display_name || user?.username || 'User';

  return (
    <div className="mobile-you-view">
      <div className="mobile-you-profile">
        <div className="mobile-you-avatar-wrap">
          {user?.avatar_url ? (
            <AvatarImg src={user.avatar_url} alt="" className="mobile-you-avatar" />
          ) : (
            <span className="mobile-you-avatar-fallback">
              {(displayName || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <h1 className="mobile-you-name">{displayName}</h1>
        {user?.username && (
          <span className="mobile-you-username">@{user.username}</span>
        )}
      </div>

      <nav className="mobile-you-nav">
        <button
          className="mobile-you-nav-item"
          onClick={() => {
            onOpenSettings?.();
            navigate('/settings');
          }}
          type="button"
        >
          <span className="mobile-you-nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </span>
          <span>
            Paramètres du compte
          </span>
          <svg className="mobile-you-nav-chevron" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
        </button>

        <button
          className="mobile-you-nav-item"
          onClick={() => navigate('/channels/@me', { state: { mobileTab: 'home' } })}
          type="button"
        >
          <span className="mobile-you-nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </span>
          <span>
            Amis
          </span>
          <svg className="mobile-you-nav-chevron" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
        </button>

        <button
          className="mobile-you-nav-item"
          onClick={() => navigate('/security')}
          type="button"
        >
          <span className="mobile-you-nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span>
            Sécurité
          </span>
          <svg className="mobile-you-nav-chevron" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
        </button>
      </nav>
    </div>
  );
});

export default MobileYouView;
