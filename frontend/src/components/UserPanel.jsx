import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { auth as authApi, settings as settingsApi, invalidateCache } from '../api';
import {
  getStoredOnlineStatus,
  setStoredOnlineStatus,
  getStoredCustomStatus,
  setStoredCustomStatus,
} from '../utils/presenceStorage';
import './UserPanel.css';

const STATUS_OPTIONS = [
  { id: 'online', label: 'Online', color: '#23a55a', icon: null },
  { id: 'idle', label: 'Idle', color: '#f0b232', icon: 'idle' },
  { id: 'dnd', label: 'Do Not Disturb', color: '#f23f43', icon: 'dnd' },
  { id: 'invisible', label: 'Invisible', color: '#80848e', icon: 'invisible' },
];

function normalizeHandle(value) {
  if (!value) return '';
  return String(value).replace(/(\s+|#)0*\s*$/, '').replace(/(?<![0-9])0\s*$/, '').trim();
}

function normalizeDisplayName(displayName, username) {
  const rawName = String(displayName || '').trim();
  const handle = normalizeHandle(username);
  if (!rawName) return handle;
  if (handle && rawName.toLowerCase() === `${handle}0`.toLowerCase()) return handle;
  return rawName;
}

function StatusIcon({ status, size = 10, borderColor = '#202225' }) {
  const opt = STATUS_OPTIONS.find(s => s.id === status) || STATUS_OPTIONS[0];

  if (status === 'idle') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <mask id="idle-mask-panel">
          <rect width="16" height="16" fill="white" />
          <circle cx="3.5" cy="3.5" r="5" fill="black" />
        </mask>
        <circle cx="8" cy="8" r="8" fill={opt.color} mask="url(#idle-mask-panel)" />
      </svg>
    );
  }

  if (status === 'dnd') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="8" fill={opt.color} />
        <rect x="3.5" y="6.5" width="9" height="3" rx="1.5" fill={borderColor} />
      </svg>
    );
  }

  if (status === 'invisible') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="8" fill={opt.color} />
        <circle cx="8" cy="8" r="4" fill={borderColor} />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="8" fill={opt.color} />
    </svg>
  );
}

export default function UserPanel() {
  const { user, accounts, switchAccount, updateUser } = useAuth();
  const { speakingUsers } = useVoice();
  const navigate = useNavigate();

  const [onlineStatus, setOnlineStatus] = useState(() => {
    return getStoredOnlineStatus(user?.id);
  });
  const [customStatus, setCustomStatus] = useState(() => {
    return getStoredCustomStatus(user?.id);
  });
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showCustomStatusModal, setShowCustomStatusModal] = useState(false);
  const [customStatusInput, setCustomStatusInput] = useState('');

  const statusMenuRef = useRef(null);
  const statusTriggerRef = useRef(null);
  const customStatusModalRef = useRef(null);
  const accountFlyoutRef = useRef(null);
  const anotherAccountRef = useRef(null);
  const flyoutTimeoutRef = useRef(null);
  const [showAccountFlyout, setShowAccountFlyout] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);

  useEffect(() => {
    setOnlineStatus(getStoredOnlineStatus(user?.id));
    setCustomStatus(getStoredCustomStatus(user?.id));
  }, [user?.id]);

  useEffect(() => {
    setStoredOnlineStatus(user?.id, onlineStatus);
  }, [user?.id, onlineStatus]);

  useEffect(() => {
    setStoredCustomStatus(user?.id, customStatus);
  }, [user?.id, customStatus]);

  const hasRefetchedForMissingName = useRef(false);
  useEffect(() => {
    if (!user?.id) return;
    const dn = normalizeDisplayName(user.display_name, user.username);
    if (dn) {
      hasRefetchedForMissingName.current = false;
      return;
    }
    if (hasRefetchedForMissingName.current) return;
    hasRefetchedForMissingName.current = true;
    invalidateCache('/auth/me');
    authApi.me().then((data) => updateUser(data)).catch(() => {});
  }, [user?.id, user?.display_name, user?.username, updateUser]);

  useEffect(() => {
    if (!showStatusMenu) setShowAccountFlyout(false);
  }, [showStatusMenu]);

  useEffect(() => {
    if (showStatusMenu) {
      setDrawerMounted(true);
      return undefined;
    }
    const host = document.querySelector('.usas-status-drawer-host');
    if (!host) {
      setDrawerMounted(false);
      return undefined;
    }
    const onEnd = (e) => {
      if (e.target === host && e.propertyName === 'max-height') {
        setDrawerMounted(false);
      }
    };
    host.addEventListener('transitionend', onEnd);
    const fallback = setTimeout(() => setDrawerMounted(false), 450);
    return () => {
      host.removeEventListener('transitionend', onEnd);
      clearTimeout(fallback);
    };
  }, [showStatusMenu]);

  useEffect(() => {
    const host = document.querySelector('.usas-status-drawer-host');
    const island = document.querySelector('.user-status-and-settings');
    host?.classList.toggle('is-open', showStatusMenu);
    island?.classList.toggle('usas-status-menu-open', showStatusMenu);
    return () => {
      host?.classList.remove('is-open');
      island?.classList.remove('usas-status-menu-open');
    };
  }, [showStatusMenu]);

  useEffect(() => {
    const island = document.querySelector('.user-status-and-settings');
    island?.classList.toggle('usas-accounts-open', showAccountFlyout);
    return () => island?.classList.remove('usas-accounts-open');
  }, [showAccountFlyout]);

  const accountWingCount = user
    ? 1 + accounts.filter((a) => String(a.userId) !== String(user.id)).length
    : 0;

  useEffect(() => {
    const host = document.querySelector('.usas-account-wing-host');
    if (!host) return;
    host.classList.remove('usas-account-wing--s', 'usas-account-wing--m', 'usas-account-wing--l');
    if (accountWingCount <= 2) host.classList.add('usas-account-wing--s');
    else if (accountWingCount === 3) host.classList.add('usas-account-wing--m');
    else host.classList.add('usas-account-wing--l');
    return () => host.classList.remove('usas-account-wing--s', 'usas-account-wing--m', 'usas-account-wing--l');
  }, [accountWingCount, showStatusMenu]);

  useEffect(() => {
    if (!showStatusMenu) return;
    const onMouseDown = (e) => {
      const inTrigger = statusTriggerRef.current?.contains(e.target);
      const inPicker = statusMenuRef.current?.contains(e.target);
      const inFlyout = accountFlyoutRef.current?.contains(e.target);
      if (!inTrigger && !inPicker && !inFlyout) {
        setShowStatusMenu(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowStatusMenu(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showStatusMenu]);

  useEffect(() => {
    if (!showCustomStatusModal) return;
    const handler = (e) => {
      if (customStatusModalRef.current && !customStatusModalRef.current.contains(e.target)) {
        setShowCustomStatusModal(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCustomStatusModal]);

  const handleStatusChange = useCallback((statusId) => {
    setOnlineStatus(statusId);
    setShowStatusMenu(false);
  }, []);

  const handleOpenCustomStatus = useCallback(() => {
    setCustomStatusInput(customStatus);
    setShowCustomStatusModal(true);
    setShowStatusMenu(false);
  }, [customStatus]);

  const handleSaveCustomStatus = useCallback(() => {
    const trimmed = customStatusInput.trim();
    setCustomStatus(trimmed);
    setShowCustomStatusModal(false);
    settingsApi.updateProfile({ statusMessage: trimmed || null }).catch(() => {});
  }, [customStatusInput]);

  const handleClearCustomStatus = useCallback(() => {
    setCustomStatus('');
    setCustomStatusInput('');
    setShowCustomStatusModal(false);
    settingsApi.updateProfile({ statusMessage: null }).catch(() => {});
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSaveCustomStatus();
    } else if (e.key === 'Escape') {
      setShowCustomStatusModal(false);
    }
  }, [handleSaveCustomStatus]);

  const FLYOUT_DELAY = 150;
  const handleAnotherAccountEnter = useCallback(() => {
    if (flyoutTimeoutRef.current) {
      clearTimeout(flyoutTimeoutRef.current);
      flyoutTimeoutRef.current = null;
    }
    setShowAccountFlyout(true);
  }, []);
  const handleAnotherAccountLeave = useCallback(() => {
    flyoutTimeoutRef.current = setTimeout(() => setShowAccountFlyout(false), FLYOUT_DELAY);
  }, []);
  const handleFlyoutEnter = useCallback(() => {
    if (flyoutTimeoutRef.current) {
      clearTimeout(flyoutTimeoutRef.current);
      flyoutTimeoutRef.current = null;
    }
    setShowAccountFlyout(true);
  }, []);
  const handleFlyoutLeave = useCallback(() => {
    flyoutTimeoutRef.current = setTimeout(() => setShowAccountFlyout(false), FLYOUT_DELAY);
  }, []);

  useEffect(() => {
    return () => {
      if (flyoutTimeoutRef.current) clearTimeout(flyoutTimeoutRef.current);
    };
  }, []);

  if (!user) return null;

  const statusOpt = STATUS_OPTIONS.find(s => s.id === onlineStatus) || STATUS_OPTIONS[0];
  const displayStatus = customStatus || statusOpt.label;
  const displayName = normalizeDisplayName(user.display_name, user.username) || '?';
  const isSpeaking = user?.id != null && speakingUsers?.has?.(String(user.id));
  const otherAccounts = accounts.filter((a) => String(a.userId) !== String(user?.id));

  const drawerHost = drawerMounted ? document.querySelector('.usas-status-drawer-host') : null;
  const accountWingHost = showStatusMenu ? document.querySelector('.usas-account-wing-host') : null;

  return (
    <>
      <div className="user-panel">
        <div
          className={`user-panel-identity${showStatusMenu ? ' is-open' : ''}`}
          ref={statusTriggerRef}
          onClick={() => setShowStatusMenu((open) => !open)}
          aria-expanded={showStatusMenu}
          aria-haspopup="true"
        >
          <div className={`user-panel-avatar${isSpeaking ? ' speaking' : ''}`}>
            {user.avatar_url ? (
              <AvatarImg
                src={user.avatar_url}
                alt={displayName}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%236366f1"/><text x="32" y="42" font-size="24" fill="white" text-anchor="middle" font-family="sans-serif">${displayName.charAt(0).toUpperCase()}</text></svg>`)}`;
                }}
              />
            ) : (
              <span>{displayName.charAt(0).toUpperCase()}</span>
            )}
            <div className="user-panel-status-dot">
              <StatusIcon status={onlineStatus} size={10} />
            </div>
          </div>
          <div className="user-panel-info">
            <span className="user-panel-name">{displayName}</span>
            <span className="user-panel-status">{displayStatus}</span>
          </div>
        </div>

        <div className="user-panel-controls">
          <button
            className="user-panel-btn"
            onClick={() => navigate('/settings')}
            title="User Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        </div>
      </div>

      {drawerHost && createPortal(
        <div className="usas-status-drawer" ref={statusMenuRef} role="menu">
          <div className="status-picker-body">
            <button type="button" className="status-picker-item" onClick={handleOpenCustomStatus}>
              <svg className="status-picker-emoji" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                {customStatus ? (
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                ) : (
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-6c.78 2.34 2.72 4 5 4s4.22-1.66 5-4H7z"/>
                )}
              </svg>
              <span>{customStatus ? 'Edit custom status' : 'Set custom status'}</span>
            </button>

            <div className="status-picker-separator" />

            {STATUS_OPTIONS.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                className={`status-picker-item${onlineStatus === opt.id ? ' selected' : ''}`}
                onClick={() => handleStatusChange(opt.id)}
              >
                <div className="status-picker-dot">
                  <StatusIcon status={opt.id} size={12} borderColor="var(--bg-secondary)" />
                </div>
                <span>{opt.label}</span>
                {onlineStatus === opt.id && (
                  <svg className="status-picker-check" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                  </svg>
                )}
              </button>
            ))}

            <div className="status-picker-separator" />

            <button
              ref={anotherAccountRef}
              type="button"
              className={`status-picker-item status-picker-another-account${showAccountFlyout ? ' is-active' : ''}`}
              onMouseEnter={handleAnotherAccountEnter}
              onMouseLeave={handleAnotherAccountLeave}
              onClick={() => setShowAccountFlyout((v) => !v)}
            >
              <span>Another account</span>
              <svg className="status-picker-arrow" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
              </svg>
            </button>
          </div>
        </div>,
        drawerHost
      )}

      {accountWingHost && createPortal(
        <div
          ref={accountFlyoutRef}
          className="usas-account-wing-panel"
          role="menu"
          aria-label="Switch account"
          onMouseEnter={handleFlyoutEnter}
          onMouseLeave={handleFlyoutLeave}
        >
          <div className="status-picker-body account-wing-body">
              <div className="status-picker-item selected" aria-current="true">
              <div className="user-panel-avatar account-wing-avatar">
              {user.avatar_url ? (
                <AvatarImg
                  src={user.avatar_url}
                  alt={displayName}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%236366f1"/><text x="32" y="42" font-size="24" fill="white" text-anchor="middle" font-family="sans-serif">${displayName.charAt(0).toUpperCase()}</text></svg>`)}`;
                  }}
                />
              ) : (
                <span>{displayName.charAt(0).toUpperCase()}</span>
              )}
              </div>
              <div className="user-panel-info account-wing-info">
                <span className="user-panel-name">{displayName}</span>
                {user.username && <span className="user-panel-status">@{user.username}</span>}
              </div>
              <svg className="status-picker-check" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
              </svg>
            </div>
            {otherAccounts.length > 0 && (
              <>
                <div className="status-picker-separator" />
                {otherAccounts.map((acc) => {
            const accountDisplayName = normalizeDisplayName(acc.displayName, acc.username) || '?';
            const accountId = acc.userId ?? acc.user_id ?? acc.id;
            return (
              <button
                key={String(accountId)}
                type="button"
                className="status-picker-item"
                role="menuitem"
                onClick={async () => {
                  setShowStatusMenu(false);
                  setShowAccountFlyout(false);
                  try {
                    await switchAccount(accountId);
                  } catch {
                    // Token expired - account was removed
                  }
                }}
              >
                <div className="user-panel-avatar account-wing-avatar">
                  {acc.avatar_url ? (
                    <AvatarImg
                      src={acc.avatar_url}
                      alt={accountDisplayName}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%236366f1"/><text x="32" y="42" font-size="24" fill="white" text-anchor="middle" font-family="sans-serif">${accountDisplayName.charAt(0).toUpperCase()}</text></svg>`)}`;
                      }}
                    />
                  ) : (
                    <span>{accountDisplayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="user-panel-info account-wing-info">
                  <span className="user-panel-name">{accountDisplayName}</span>
                  {acc.username && <span className="user-panel-status">@{acc.username}</span>}
                </div>
              </button>
            );
                })}
              </>
            )}
            <div className="status-picker-separator" />
            <button
              type="button"
              className="status-picker-item status-picker-add-account"
              role="menuitem"
              onClick={() => {
                setShowStatusMenu(false);
                setShowAccountFlyout(false);
                navigate('/login?add=1');
              }}
            >
              <span className="status-picker-add-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </span>
              <span>Add an account</span>
            </button>
          </div>
        </div>,
        accountWingHost
      )}

      {showCustomStatusModal && (
        <div className="custom-status-overlay">
          <div className="custom-status-modal" ref={customStatusModalRef}>
            <div className="custom-status-modal-header">
              <h3>Set a custom status</h3>
              <button className="custom-status-close" onClick={() => setShowCustomStatusModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
                </svg>
              </button>
            </div>
            <div className="custom-status-modal-body">
              <label className="custom-status-label">What's going on?</label>
              <input
                className="custom-status-input"
                type="text"
                value={customStatusInput}
                onChange={(e) => setCustomStatusInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Support has no limit"
                maxLength={128}
                autoFocus
              />
              <div className="custom-status-char-count">{customStatusInput.length}/128</div>
            </div>
            <div className="custom-status-modal-footer">
              {customStatus && (
                <button className="custom-status-clear-btn" onClick={handleClearCustomStatus}>
                  Clear Status
                </button>
              )}
              <div className="custom-status-footer-spacer" />
              <button className="custom-status-cancel-btn" onClick={() => setShowCustomStatusModal(false)}>
                Cancel
              </button>
              <button className="custom-status-save-btn" onClick={handleSaveCustomStatus}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
