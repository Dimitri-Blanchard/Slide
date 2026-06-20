import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import CreateYourServerModal from './CreateYourServerModal';
import CreateServerModal from './CreateServerModal';
import InviteModal from './InviteModal';
import DiscoverServersModal from './DiscoverServersModal';
import './CreateYourServerModal.css';
import './CreateServerModal.css';
import './InviteModal.css';
import './ServerCreationFlow.css';

const MORPH_ENABLE_MS = 320;
const CLOSE_MS = 250;

export default function ServerCreationFlow({ isOpen, onClose, onTeamsChange, teams }) {
  const navigate = useNavigate();
  const [view, setView] = useState('hub');
  const [direction, setDirection] = useState('forward');
  const [createTemplate, setCreateTemplate] = useState(null);
  const [exiting, setExiting] = useState(false);
  const [morphEnabled, setMorphEnabled] = useState(false);
  const morphTimerRef = useRef(null);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setView('hub');
      setCreateTemplate(null);
      setDirection('forward');
      setExiting(false);
      setMorphEnabled(false);
      if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
      morphTimerRef.current = setTimeout(() => setMorphEnabled(true), MORPH_ENABLE_MS);
    } else {
      setMorphEnabled(false);
      if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
    }
    return () => {
      if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setExiting(false);
      onClose?.();
    }, CLOSE_MS);
  }, [exiting, onClose]);

  const goTo = useCallback((nextView, dir = 'forward', template = undefined) => {
    setDirection(dir);
    if (nextView === 'hub') setCreateTemplate(null);
    if (template !== undefined) setCreateTemplate(template);
    setView(nextView);
  }, []);

  if (!isOpen && !exiting) return null;

  const flow = (
    <div
      className={`scf-overlay ${exiting ? 'scf-exiting' : ''}`}
      onClick={exiting ? undefined : handleClose}
    >
      <div
        className={`scf-shell ${morphEnabled ? 'scf-shell--morph' : 'scf-shell--enter'}`}
        data-view={view}
        data-direction={direction}
        onClick={(e) => e.stopPropagation()}
      >
        <div key={view} className="scf-view">
          {view === 'hub' && (
            <CreateYourServerModal
              embedded
              isOpen
              onClose={handleClose}
              onCreateServer={(template) => goTo('create', 'forward', template)}
              onJoinServer={() => goTo('join', 'forward')}
            />
          )}
          {view === 'create' && (
            <CreateServerModal
              embedded
              isOpen
              initialTemplate={createTemplate}
              onClose={handleClose}
              onBackToHub={() => goTo('hub', 'back')}
              onServerCreated={(team) => {
                onTeamsChange?.([...(teams || []), team]);
                handleClose();
                navigate(serverPath(team));
              }}
            />
          )}
          {view === 'join' && (
            <InviteModal
              embedded
              isOpen
              onClose={handleClose}
              onBack={() => goTo('hub', 'back')}
              onServerJoined={(team) => {
                onTeamsChange?.([...(teams || []), team]);
              }}
            />
          )}
          {view === 'discover' && (
            <DiscoverServersModal
              embedded
              isOpen
              onClose={handleClose}
              onBack={() => goTo('hub', 'back')}
              onServerJoined={(team) => {
                onTeamsChange?.([...(teams || []), team]);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(flow, document.body);
}
