import React, { memo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import './TopicModal.css';

const TextChannelIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
    <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41001 9L8.35001 15H14.35L15.41 9H9.41001Z"/>
  </svg>
);

const TopicModal = memo(function TopicModal({ channel, canManage, onClose, onStartEditTopic }) {
  const overlayRef = useRef(null);
  const enterInstant = useModalEnterAnimation('topic-modal', true);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleEditTopic = () => {
    onClose();
    onStartEditTopic?.();
  };

  const modal = (
    <div className={`topic-modal-overlay${enterInstant ? ' modal-enter-instant' : ''}`} ref={overlayRef} onClick={handleOverlayClick}>
      <div className="topic-modal" role="dialog" aria-modal="true">
        <div className="topic-modal-header">
          <span className="topic-modal-icon"><TextChannelIcon /></span>
          <span className="topic-modal-channel">#{channel?.name || 'general'}</span>
          <button className="topic-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="topic-modal-body">
          {channel?.topic ? (
            <p className="topic-modal-text">{channel.topic}</p>
          ) : (
            <p className="topic-modal-empty">This channel has no topic set.</p>
          )}
        </div>
        <div className="topic-modal-footer">
          {canManage && (
            <button className="topic-modal-btn topic-modal-btn-primary" onClick={handleEditTopic}>
              Edit Topic
            </button>
          )}
          <button className="topic-modal-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
});

export default TopicModal;
