import React, { memo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './VoiceJoinSheet.css';

/**
 * Mobile bottom sheet — join voice channel with swipe-to-dismiss.
 */
const VoiceJoinSheet = memo(function VoiceJoinSheet({
  isOpen,
  channelName,
  kicker,
  title,
  description,
  confirmLabel,
  joiningLabel,
  cancelLabel,
  joining,
  onConfirm,
  onCancel,
}) {
  const sheetRef = useRef(null);
  const grabActiveRef = useRef(false);
  const grabStartYRef = useRef(0);
  const dragYRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  const endGrab = useCallback(() => {
    if (!grabActiveRef.current) return;
    grabActiveRef.current = false;
    const d = dragYRef.current;
    dragYRef.current = 0;
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.classList.remove('is-dragging');
      sheet.style.transform = '';
    }
    if (d > 72) onCancel?.();
  }, [onCancel]);

  const onGrabPointerDown = useCallback((e) => {
    if (joining) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    grabActiveRef.current = true;
    grabStartYRef.current = e.clientY;
    dragYRef.current = 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [joining]);

  const onGrabPointerMove = useCallback((e) => {
    if (!grabActiveRef.current) return;
    const dy = Math.max(0, e.clientY - grabStartYRef.current);
    dragYRef.current = dy;
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
      if (dy > 2) sheet.classList.add('is-dragging');
    }
  }, []);

  const onGrabPointerUp = useCallback(
    (e) => {
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      endGrab();
    },
    [endGrab]
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="voice-join-sheet-layer" role="dialog" aria-modal="true" aria-labelledby="voice-join-sheet-title">
      <button
        type="button"
        className="voice-join-sheet-backdrop"
        onClick={onCancel}
        aria-label={cancelLabel || 'Close'}
      />
      <div ref={sheetRef} className="voice-join-sheet">
        <div
          className="voice-join-sheet-grab"
          aria-hidden
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
          onPointerCancel={onGrabPointerUp}
        />
        {kicker && <p className="voice-join-sheet-kicker">{kicker}</p>}
        <h2 id="voice-join-sheet-title" className="voice-join-sheet-title">
          {title}
        </h2>
        {description && <p className="voice-join-sheet-desc">{description}</p>}
        <div className="voice-join-sheet-actions">
          <button
            type="button"
            className="voice-join-sheet-btn voice-join-sheet-btn-primary"
            onClick={onConfirm}
            disabled={joining}
          >
            {joining ? joiningLabel : confirmLabel}
          </button>
          <button
            type="button"
            className="voice-join-sheet-btn voice-join-sheet-btn-muted"
            onClick={onCancel}
            disabled={joining}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

export default VoiceJoinSheet;
