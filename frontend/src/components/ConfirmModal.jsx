import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmModal.css';

export default function ConfirmModal({ isOpen, title, message, confirmText, cancelText, onConfirm, onCancel, type }) {
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

  const modal = (
    <div className="confirm-overlay" onClick={onCancel}>
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
