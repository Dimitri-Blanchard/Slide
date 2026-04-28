import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Globe } from 'lucide-react';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import './CreateYourServerModal.css';

// Icons matching the Discord-style modal
const CreateMyOwnIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
);

const GamingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4 2c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2-3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
  </svg>
);

const FriendsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
);

const StudyGroupIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
  </svg>
);

const SchoolClubIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
  </svg>
);

const ArrowIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
  </svg>
);

const TEMPLATES = [
  { id: 'gaming', name: 'Gaming', icon: <GamingIcon /> },
  { id: 'community', name: 'Friends', icon: <FriendsIcon /> },
  { id: 'study', name: 'Study Group', icon: <StudyGroupIcon /> },
  { id: 'community', name: 'School Club', icon: <SchoolClubIcon /> },
];

export default function CreateYourServerModal({ isOpen, onClose, onCreateServer, onJoinServer, onDiscoverServers, exiting }) {
  const navigate = useNavigate();
  const enterInstant = useModalEnterAnimation('create-your-server-modal', isOpen);
  if (!isOpen) return null;

  const handleCreateMyOwn = () => {
    onCreateServer?.('empty');
  };

  const handleTemplate = (templateId) => {
    onCreateServer?.(templateId);
  };

  const handleJoin = () => {
    onJoinServer?.();
  };

  const handleDiscover = () => {
    onClose?.();
    navigate('/community');
  };

  const handleOverlayClick = () => {
    if (!exiting) onClose();
  };

  const modal = (
    <div className={`cysm-overlay ${exiting ? 'cysm-exiting' : ''}${enterInstant && !exiting ? ' modal-enter-instant' : ''}`} onClick={handleOverlayClick}>
      <div className={`cysm-modal ${exiting ? 'cysm-exiting' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="cysm-header">
          <button className="cysm-close" onClick={onClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
            </svg>
          </button>
          <h2>Create Your Server</h2>
          <p>Your server is where you and your friends hang out. Make yours and start talking.</p>
        </div>

        <div className="cysm-content">
          <button className="cysm-row cysm-create-own" onClick={handleCreateMyOwn}>
            <span className="cysm-row-icon cysm-create-icon">
              <CreateMyOwnIcon />
            </span>
            <span className="cysm-row-text">Create My Own</span>
            <span className="cysm-row-arrow"><ArrowIcon /></span>
          </button>

          <div className="cysm-section-label">START FROM A TEMPLATE</div>
          <div className="cysm-templates">
            {TEMPLATES.map((tmpl, idx) => (
              <button
                key={`${tmpl.id}-${idx}`}
                className="cysm-row"
                onClick={() => handleTemplate(tmpl.id)}
              >
                <span className="cysm-row-icon">{tmpl.icon}</span>
                <span className="cysm-row-text">{tmpl.name}</span>
                <span className="cysm-row-arrow"><ArrowIcon /></span>
              </button>
            ))}
          </div>
        </div>

        <div className="cysm-join-section">
          <p className="cysm-join-question">Have an invite already?</p>
          <button className="cysm-join-btn" onClick={handleJoin}>
            Join a Server
          </button>
          <button className="cysm-discover-btn" onClick={handleDiscover}>
            <Globe size={18} strokeWidth={2} />
            Explore Public Servers
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
