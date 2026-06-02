import React, { memo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './MobileSheet.css';

const MobileSheet = memo(function MobileSheet({
  isOpen,
  title,
  description,
  footer,
  children,
  onClose,
  closeLabel = 'Close',
  className = '',
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
    if (d > 72) onClose?.();
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
    [endGrab],
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="mobile-sheet-layer" role="dialog" aria-modal="true" aria-labelledby="mobile-sheet-title">
      <button type="button" className="mobile-sheet-backdrop" onClick={onClose} aria-label={closeLabel} />
      <div ref={sheetRef} className={`mobile-sheet ${className}`}>
        <div
          className="mobile-sheet-grab"
          aria-hidden
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
          onPointerCancel={onGrabPointerUp}
        />
        {title && <h2 id="mobile-sheet-title" className="mobile-sheet-title">{title}</h2>}
        {description && <p className="mobile-sheet-desc">{description}</p>}
        {children && <div className="mobile-sheet-content">{children}</div>}
        {footer && <div className="mobile-sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
});

export default MobileSheet;
