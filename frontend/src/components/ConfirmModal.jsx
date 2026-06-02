import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import MobileSheet from './MobileSheet';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import { useNativeBackHandler } from '../hooks/useNativeBackHandler';
import './ConfirmModal.css';

export default function ConfirmModal({ isOpen, title, message, confirmText, cancelText, onConfirm, onCancel, type }) {
  const enterInstant = useModalEnterAnimation('confirm-modal', isOpen);
  const isMobileClient =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('platform-mobile');

  useNativeBackHandler(isOpen, () => {
    onCancel?.();
    return true;
  }, 120);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  if (isMobileClient) {
    return (
      <MobileSheet
        isOpen={isOpen}
        title={title}
        description={message}
        onClose={onCancel}
        closeLabel={cancelText || 'Annuler'}
        className={`confirm-sheet confirm-${type || 'default'}`}
        priority={120}
        footer={(
          <>
            <button type="button" className={`confirm-btn confirm confirm-${type || 'default'}`} onClick={onConfirm}>
              {confirmText || 'Confirmer'}
            </button>
            <button type="button" className="confirm-btn cancel" onClick={onCancel}>
              {cancelText || 'Annuler'}
            </button>
          </>
        )}
      />
    );
  }

  const modal = (
    <div className={`confirm-overlay${enterInstant ? ' modal-enter-instant' : ''}`} onClick={onCancel}>
      <div className={`confirm-modal confirm-${type || 'default'}`} onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="confirm-title">{title}</h3>}
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" className="confirm-btn cancel" onClick={onCancel}>
            {cancelText || 'Annuler'}
          </button>
          <button type="button" className={`confirm-btn confirm confirm-${type || 'default'}`} onClick={onConfirm}>
            {confirmText || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
