import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import './AddNoteModal.css';

const NOTE_KEY = (userId) => `slide_user_note_${userId}`;

export default function AddNoteModal({ isOpen, onClose, user, onSaved }) {
  const [note, setNote] = useState('');
  const { t } = useLanguage();
  const { notify } = useNotification();

  useEffect(() => {
    if (isOpen && user?.id) {
      setNote(localStorage.getItem(NOTE_KEY(user.id)) || '');
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
    if (note.trim()) {
      localStorage.setItem(NOTE_KEY(user.id), note.trim());
    } else {
      localStorage.removeItem(NOTE_KEY(user.id));
    }
    notify.success(t('common.saved') || 'Saved');
    onSaved?.();
    onClose();
  };

  if (!isOpen) return null;

  const userName = user?.display_name || user?.username || 'user';

  return createPortal(
    <div className="add-note-overlay" onClick={onClose}>
      <div className="add-note-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="add-note-title">
          {t('chat.addNote') || 'Add Note'}
        </h3>
        <p className="add-note-subtitle">
          {(t('chat.addNoteDesc') || 'Add a note for {name} (only visible to you)').replace('{name}', userName)}
        </p>
        <form onSubmit={handleSubmit}>
          <textarea
            className="add-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('chat.notePlaceholder') || 'Enter note'}
            autoFocus
            rows={4}
          />
          <div className="add-note-actions">
            <button type="button" className="add-note-btn cancel" onClick={onClose}>
              {t('common.cancel') || 'Cancel'}
            </button>
            <button type="submit" className="add-note-btn confirm">
              {t('common.save') || 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
