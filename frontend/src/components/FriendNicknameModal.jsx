import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import './FriendNicknameModal.css';

const NICKNAME_KEY = (userId) => `slide_friend_nickname_${userId}`;

export default function FriendNicknameModal({ isOpen, onClose, user, onSaved }) {
  const [nickname, setNickname] = useState('');
  const { t } = useLanguage();
  const { notify } = useNotification();

  useEffect(() => {
    if (isOpen && user?.id) {
      setNickname(localStorage.getItem(NICKNAME_KEY(user.id)) || '');
    }
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!user?.id) return;
    if (nickname.trim()) {
      localStorage.setItem(NICKNAME_KEY(user.id), nickname.trim());
    } else {
      localStorage.removeItem(NICKNAME_KEY(user.id));
    }
    notify.success(t('common.saved') || 'Saved');
    onSaved?.();
    onClose();
  };

  if (!isOpen) return null;

  const friendName = user?.display_name || user?.username || 'friend';

  return createPortal(
    <div className="friend-nickname-overlay" onClick={onClose}>
      <div className="friend-nickname-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="friend-nickname-title">
          {t('chat.addFriendNickname') || 'Add Friend Nickname'}
        </h3>
        <p className="friend-nickname-subtitle">
          {(t('chat.addFriendNicknameDesc') || 'Set a nickname for {name} (only visible to you)').replace('{name}', friendName)}
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className="friend-nickname-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t('chat.nicknamePlaceholder') || 'Enter nickname'}
            autoFocus
            maxLength={32}
          />
          <div className="friend-nickname-actions">
            <button type="button" className="friend-nickname-btn cancel" onClick={onClose}>
              {t('common.cancel') || 'Cancel'}
            </button>
            <button type="submit" className="friend-nickname-btn confirm">
              {t('common.save') || 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
