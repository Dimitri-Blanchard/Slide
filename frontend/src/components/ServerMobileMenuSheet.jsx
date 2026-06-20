import React, { memo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { useNativeBackHandler } from '../hooks/useNativeBackHandler';
import AppIcon from './icons/AppIcon';
import './MessageMobileActionSheet.css';

function SheetRow({ icon, label, onClick, danger, accent }) {
  const className = [
    'message-action-sheet-row',
    danger ? 'message-action-sheet-row--danger' : '',
    accent ? 'message-action-sheet-row--accent' : '',
  ].filter(Boolean).join(' ');
  return (
    <button type="button" className={className} onClick={onClick}>
      <span className="message-action-sheet-row-icon" aria-hidden>{icon}</span>
      <span className="message-action-sheet-row-label">{label}</span>
    </button>
  );
}

const ServerMobileMenuSheet = memo(function ServerMobileMenuSheet({
  team,
  onClose,
  onInvite,
  onOpenSettings,
  canOpenServerSettings = false,
  onCreateChannel,
  onCreateCategory,
  onLeave,
}) {
  const { t } = useLanguage();
  const tx = (key, fallback) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const sheetElRef = useRef(null);
  const grabActiveRef = useRef(false);
  const grabStartYRef = useRef(0);
  const dragYRef = useRef(0);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const endGrab = useCallback(() => {
    if (!grabActiveRef.current) return;
    grabActiveRef.current = false;
    const d = dragYRef.current;
    dragYRef.current = 0;
    if (sheetElRef.current) sheetElRef.current.style.transform = '';
    if (d > 88) onClose();
  }, [onClose]);

  const onGrabPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    grabActiveRef.current = true;
    grabStartYRef.current = e.clientY;
    dragYRef.current = 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onGrabPointerMove = useCallback((e) => {
    if (!grabActiveRef.current) return;
    const dy = Math.max(0, e.clientY - grabStartYRef.current);
    dragYRef.current = dy;
    if (sheetElRef.current) {
      sheetElRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
      if (dy > 2) sheetElRef.current.classList.add('is-dragging');
    }
  }, []);

  const onGrabPointerUp = useCallback(
    (e) => {
      if (sheetElRef.current) sheetElRef.current.classList.remove('is-dragging');
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      endGrab();
    },
    [endGrab]
  );

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useNativeBackHandler(true, () => {
    onClose();
    return true;
  }, 125);

  const run = (fn) => () => {
    fn?.();
    onClose();
  };

  return createPortal(
    <div
      className="message-action-sheet-layer"
      role="dialog"
      aria-modal="true"
      aria-label={tx('server.menu', 'Server menu')}
    >
      <button
        type="button"
        className="message-action-sheet-backdrop"
        onClick={onClose}
        aria-label={tx('common.close', 'Close')}
      />
      <div ref={sheetElRef} className="message-action-sheet">
        <div
          className="message-action-sheet-grab"
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
          onPointerCancel={onGrabPointerUp}
          role="presentation"
        />
        <div className="message-action-sheet-quick-label">{team?.name}</div>
        <div className="message-action-sheet-scroll">
          <SheetRow
            icon={<AppIcon name="userPlus" size={22} />}
            label={tx('server.invitePeople', 'Invite People')}
            accent
            onClick={run(onInvite)}
          />
          {canOpenServerSettings && (
            <SheetRow
              icon={<AppIcon name="settings" size={22} />}
              label={tx('server.settings', 'Server Settings')}
              onClick={run(onOpenSettings)}
            />
          )}
          <SheetRow
            icon={<AppIcon name="plus" size={22} weight="bold" />}
            label={tx('server.createChannel', 'Create Channel')}
            onClick={run(onCreateChannel)}
          />
          <SheetRow
            icon={<AppIcon name="archive" size={22} />}
            label={tx('server.createCategory', 'Create Category')}
            onClick={run(onCreateCategory)}
          />
          {team?.role !== 'owner' && (
            <SheetRow
              icon={<AppIcon name="signOut" size={22} />}
              label={tx('server.leave', 'Leave Server')}
              danger
              onClick={run(onLeave)}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});

export default ServerMobileMenuSheet;
