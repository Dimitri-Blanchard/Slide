import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettingsUi } from '../context/SettingsUiContext';
import { useLanguage } from '../context/LanguageContext';
import { useOrbs } from '../context/OrbsContext';
import Avatar from './Avatar';
import AppIcon from './icons/AppIcon';
import AddNoteModal from './AddNoteModal';
import { loadUserNote } from '../utils/userNotes';
import { getStoredOnlineStatus } from '../utils/presenceStorage';
import { hapticSelection } from '../utils/nativeHaptics';
import './MobileProfileSheet.css';

const STATUS_LABELS = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  invisible: 'Invisible',
};

function normalizeDisplayName(displayName, username) {
  const raw = String(displayName || '').trim();
  const handle = String(username || '').replace(/(\s+|#)0*\s*$/, '').trim();
  if (!raw) return handle || '?';
  if (handle && raw.toLowerCase() === `${handle}0`.toLowerCase()) return handle;
  return raw;
}

export default function MobileProfileSheet({ isOpen, onClose, pendingFriendsCount = 0 }) {
  const { user } = useAuth();
  const { openSettings } = useSettingsUi();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const orbs = useOrbs();
  const [activeTab, setActiveTab] = useState('main');
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    setActiveTab('main');
    setNote(loadUserNote(user.id));
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!user?.id) return;
    const onNoteChanged = (e) => {
      if (String(e.detail?.userId) === String(user.id)) {
        setNote(e.detail?.note ?? loadUserNote(user.id));
      }
    };
    window.addEventListener('slide:user-note-changed', onNoteChanged);
    return () => window.removeEventListener('slide:user-note-changed', onNoteChanged);
  }, [user?.id]);

  const handleEditProfile = useCallback(() => {
    hapticSelection();
    onClose();
    openSettings();
  }, [onClose, openSettings]);

  const handleFriends = useCallback(() => {
    hapticSelection();
    onClose();
    navigate('/friends');
  }, [onClose, navigate]);

  if (!isOpen || !user) return null;

  const displayName = normalizeDisplayName(user.display_name, user.username);
  const username = user.username || user.email?.split('@')[0] || '';
  const statusKey = getStoredOnlineStatus(user.id);
  const statusLabel = STATUS_LABELS[statusKey] || t('common.invisible');
  const bio = user.about_me || user.bio || '';
  const joinDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return createPortal(
    <div className="mps-root" role="dialog" aria-modal="true" aria-label={t('profile.title')}>
      <header className="mps-topbar">
        <button type="button" className="mps-topbar-btn" onClick={onClose} aria-label={t('common.close')}>
          <AppIcon name="close" size={22} />
        </button>
        <div className="mps-topbar-actions">
          <button
            type="button"
            className="mps-topbar-btn mps-topbar-btn--badge"
            onClick={() => { hapticSelection(); onClose(); navigate('/quests'); }}
            aria-label="Quests"
          >
            <AppIcon name="quests" size={20} />
            <span className="mps-topbar-dot" />
          </button>
          <button
            type="button"
            className="mps-topbar-btn mps-topbar-btn--badge"
            onClick={() => { hapticSelection(); onClose(); navigate('/channels/@me'); }}
            aria-label="Home"
          >
            <AppIcon name="home" size={20} />
            {pendingFriendsCount > 0 && <span className="mps-topbar-dot" />}
          </button>
          <button
            type="button"
            className="mps-topbar-btn"
            onClick={() => { hapticSelection(); onClose(); navigate('/nitro'); }}
            aria-label="Nitro"
          >
            <AppIcon name="nitro" size={20} />
          </button>
          <button
            type="button"
            className="mps-topbar-btn"
            onClick={handleEditProfile}
            aria-label={t('settings.title')}
          >
            <AppIcon name="settings" size={20} />
          </button>
        </div>
      </header>

      <div className="mps-scroll">
        <section className="mps-hero">
          <div className="mps-hero-row">
            <div className="mps-avatar-wrap">
              <Avatar user={user} size="xlarge" gifAnimate />
            </div>
            <button type="button" className="mps-origin-bubble" onClick={handleEditProfile}>
              <span className="mps-origin-plus">+</span>
              <span className="mps-origin-text">
                {bio ? bio.slice(0, 48) : "What's your username origin story?"}
              </span>
            </button>
          </div>

          <button type="button" className="mps-name-row" onClick={handleEditProfile}>
            <span className="mps-display-name">{displayName}</span>
            <AppIcon name="caretDown" size={16} className="mps-name-chevron" />
          </button>

          <div className="mps-handle-row">
            <span className="mps-username">{username}</span>
            {user.has_nitro && (
              <span className="mps-badge-pill" title="Nitro">
                <AppIcon name="nitro" size={12} />
              </span>
            )}
          </div>

          <p className="mps-status-line">{statusLabel}</p>
        </section>

        <button type="button" className="mps-edit-btn" onClick={handleEditProfile}>
          <AppIcon name="edit" size={18} />
          <span>{t('profile.editProfile')}</span>
        </button>

        <nav className="mps-tabs" aria-label="Profile sections">
          <button
            type="button"
            className={`mps-tab${activeTab === 'main' ? ' active' : ''}`}
            onClick={() => { hapticSelection(); setActiveTab('main'); }}
          >
            Main
          </button>
          <button
            type="button"
            className={`mps-tab${activeTab === 'wishlist' ? ' active' : ''}`}
            onClick={() => { hapticSelection(); setActiveTab('wishlist'); }}
          >
            Wishlist
          </button>
        </nav>

        {activeTab === 'main' ? (
          <div className="mps-cards">
            <div className="mps-card mps-card--row">
              <span className="mps-card-label">{t('shop.orbs')} Balance</span>
              <span className="mps-orbs-pill">
                <AppIcon name="gift" size={14} />
                <span>{orbs}</span>
              </span>
            </div>

            {(bio || true) && (
              <div className="mps-card">
                <span className="mps-card-label">{t('profile.aboutMe')}</span>
                <p className="mps-card-value mps-card-value--bio">
                  {bio || <span className="mps-muted">Add a bio in Edit Profile</span>}
                </p>
              </div>
            )}

            {joinDate && (
              <div className="mps-card">
                <span className="mps-card-label">{t('profile.memberSince')}</span>
                <div className="mps-member-row">
                  <AppIcon name="chat" size={16} />
                  <span className="mps-card-value">{joinDate}</span>
                </div>
              </div>
            )}

            <button type="button" className="mps-card mps-card--link" onClick={handleFriends}>
              <span className="mps-card-label">{t('friends.title')}</span>
              <div className="mps-card-trailing">
                {pendingFriendsCount > 0 && (
                  <span className="mps-friends-badge">{pendingFriendsCount > 99 ? '99+' : pendingFriendsCount}</span>
                )}
                <AppIcon name="caretDown" size={18} className="mps-caret-right" />
              </div>
            </button>

            <button type="button" className="mps-card mps-card--link" onClick={() => setNoteModalOpen(true)}>
              <span className="mps-card-label">Note (only visible to you)</span>
              <div className="mps-card-trailing">
                {note && <span className="mps-note-preview">{note.slice(0, 24)}{note.length > 24 ? '…' : ''}</span>}
                <AppIcon name="edit" size={18} />
              </div>
            </button>
          </div>
        ) : (
          <div className="mps-wishlist-empty">
            <p>Your wishlist is empty</p>
          </div>
        )}
      </div>

      <AddNoteModal
        isOpen={noteModalOpen}
        user={user}
        onClose={() => setNoteModalOpen(false)}
      />
    </div>,
    document.body
  );
}
