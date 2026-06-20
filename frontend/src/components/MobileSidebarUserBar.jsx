import React, { useState, useCallback } from 'react';
import { AvatarImg } from './Avatar';
import AppIcon from './icons/AppIcon';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { getStoredOnlineStatus, getStoredCustomStatus } from '../utils/presenceStorage';
import { hapticSelection } from '../utils/nativeHaptics';
import MobileProfileSheet from './MobileProfileSheet';
import './MobileSidebarUserBar.css';

const STATUS_OPTIONS = [
  { id: 'online', label: 'Online', color: '#23a55a' },
  { id: 'idle', label: 'Idle', color: '#f0b232' },
  { id: 'dnd', label: 'Do Not Disturb', color: '#f23f43' },
  { id: 'invisible', label: 'Invisible', color: '#80848e' },
];

function normalizeDisplayName(displayName, username) {
  const raw = String(displayName || '').trim();
  const handle = String(username || '').replace(/(\s+|#)0*\s*$/, '').trim();
  if (!raw) return handle || '?';
  if (handle && raw.toLowerCase() === `${handle}0`.toLowerCase()) return handle;
  return raw;
}

function StatusDot({ status }) {
  const opt = STATUS_OPTIONS.find((s) => s.id === status) || STATUS_OPTIONS[0];
  if (status === 'idle') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <mask id="msb-idle-mask">
          <rect width="16" height="16" fill="white" />
          <circle cx="3.5" cy="3.5" r="5" fill="black" />
        </mask>
        <circle cx="8" cy="8" r="8" fill={opt.color} mask="url(#msb-idle-mask)" />
      </svg>
    );
  }
  if (status === 'dnd') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="8" fill={opt.color} />
        <rect x="3.5" y="6.5" width="9" height="3" rx="1.5" fill="#111214" />
      </svg>
    );
  }
  if (status === 'invisible') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="8" fill={opt.color} />
        <circle cx="8" cy="8" r="4" fill="#111214" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill={opt.color} />
    </svg>
  );
}

export default function MobileSidebarUserBar({
  notificationCount = 0,
  isNotificationsActive = false,
  onNotificationsClick,
  pendingFriendsCount = 0,
  embedded = false,
}) {
  const { user } = useAuth();
  const { speakingUsers } = useVoice();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleIdentityClick = useCallback(() => {
    hapticSelection();
    setProfileOpen(true);
  }, []);

  const handleNotificationsClick = useCallback((e) => {
    e.stopPropagation();
    hapticSelection();
    onNotificationsClick?.(e);
  }, [onNotificationsClick]);

  if (!user) return null;

  const displayName = normalizeDisplayName(user.display_name, user.username);
  const onlineStatus = getStoredOnlineStatus(user.id);
  const customStatus = getStoredCustomStatus(user.id);
  const statusOpt = STATUS_OPTIONS.find((s) => s.id === onlineStatus) || STATUS_OPTIONS[0];
  const displayStatus = customStatus || statusOpt.label;
  const isSpeaking = user?.id != null && speakingUsers?.has?.(String(user.id));

  return (
    <>
      <div className={`msb-root usas-bottom-bar min-bottom-bar${embedded ? ' msb-root--embedded' : ''}`}>
        <button
          type="button"
          className="msb-identity"
          onClick={handleIdentityClick}
          aria-label={`${displayName}, open profile`}
        >
          <div className={`msb-avatar${isSpeaking ? ' speaking' : ''}`}>
            {user.avatar_url ? (
              <AvatarImg src={user.avatar_url} alt="" />
            ) : (
              <span>{displayName.charAt(0).toUpperCase()}</span>
            )}
            <div className="msb-status-dot">
              <StatusDot status={onlineStatus} />
            </div>
          </div>
          <div className="msb-info">
            <span className="msb-name">
              {displayName}
              <AppIcon name="caretDown" size={14} className="msb-name-chevron" />
            </span>
            <span className="msb-status">{displayStatus}</span>
          </div>
        </button>

        <button
          type="button"
          className={`msb-notif-btn${isNotificationsActive ? ' active' : ''}`}
          onClick={handleNotificationsClick}
          aria-label="Notifications"
        >
          <AppIcon name="notification" size={22} />
          {notificationCount > 0 && (
            <span className="msb-notif-badge">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </button>
      </div>

      <MobileProfileSheet
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        pendingFriendsCount={pendingFriendsCount}
      />
    </>
  );
}
