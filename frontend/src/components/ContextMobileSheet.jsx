import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { Icons } from './ContextMenu';
import { useNativeBackHandler } from '../hooks/useNativeBackHandler';
import './ContextMobileSheet.css';

function SheetRow({ item, onActivate }) {
  if (item.separator) {
    return <div className="context-mobile-sheet-separator" role="separator" />;
  }
  if (item.custom) {
    return <div className="context-mobile-sheet-custom">{item.custom}</div>;
  }

  const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
  const hasFlyout = !!item.hoverFlyout;

  return (
    <button
      type="button"
      className={`context-mobile-sheet-row${item.danger ? ' context-mobile-sheet-row--danger' : ''}${item.disabled ? ' is-disabled' : ''}`}
      disabled={!!item.disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (item.disabled) return;
        if (hasSubmenu) {
          onActivate(item);
          return;
        }
        if (hasFlyout && item.onClick) {
          item.onClick(e);
          if (!item.keepOpen) onActivate(null, true);
          return;
        }
        if (!item.keepOpen) {
          item.onClick?.(e);
          if (!item.custom) {
            // Defer close so the same tap doesn't activate the row under the sheet.
            requestAnimationFrame(() => onActivate(null, true));
          }
        } else {
          item.onClick?.(e);
        }
      }}
    >
      {item.icon && <span className="context-mobile-sheet-row-icon">{item.icon}</span>}
      <span className="context-mobile-sheet-row-label">
        {item.label}
        {item.description && <span className="context-mobile-sheet-row-desc">{item.description}</span>}
      </span>
      {item.checked != null && (
        <span className={`context-mobile-sheet-row-check${item.checked ? ' is-checked' : ''}`} aria-hidden="true" />
      )}
      {(hasSubmenu || hasFlyout) && (
        <span className="context-mobile-sheet-row-chevron" aria-hidden>{Icons.chevronRight}</span>
      )}
    </button>
  );
}

const ContextMobileSheet = memo(function ContextMobileSheet({
  items = [],
  title,
  onClose,
}) {
  const sheetRef = useRef(null);
  const grabActiveRef = useRef(false);
  const grabStartYRef = useRef(0);
  const dragYRef = useRef(0);
  const [stack, setStack] = useState([{ title: title || null, items }]);

  useEffect(() => {
    setStack([{ title: title || null, items }]);
  }, [items, title]);

  const current = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  useEffect(() => {
    if (!items?.length) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [items]);

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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (canGoBack) setStack((s) => s.slice(0, -1));
        else onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canGoBack, onClose]);

  useNativeBackHandler(true, () => {
    if (canGoBack) {
      setStack((s) => s.slice(0, -1));
      return true;
    }
    onClose?.();
    return true;
  }, 120);

  const handleActivate = useCallback((item, closeAll = false) => {
    if (closeAll) {
      onClose?.();
      return;
    }
    if (item?.submenu) {
      setStack((s) => [...s, { title: item.label, items: item.submenu }]);
    }
  }, [onClose]);

  const handleSubItemClick = useCallback((subItem, e) => {
    if (subItem.disabled) return;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    subItem.onClick?.();
    if (!subItem.keepOpen) {
      requestAnimationFrame(() => onClose?.());
    }
  }, [onClose]);

  const isSubView = canGoBack;

  return createPortal(
    <div className="context-mobile-sheet-layer" role="dialog" aria-modal="true">
      <button type="button" className="context-mobile-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <div ref={sheetRef} className="context-mobile-sheet">
        <div
          className="context-mobile-sheet-grab"
          aria-hidden
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
          onPointerCancel={onGrabPointerUp}
        />
        {(canGoBack || current.title) && (
          <div className="context-mobile-sheet-header">
            {canGoBack && (
              <button
                type="button"
                className="context-mobile-sheet-back"
                onClick={() => setStack((s) => s.slice(0, -1))}
                aria-label="Back"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {current.title && <h2 className="context-mobile-sheet-title">{current.title}</h2>}
          </div>
        )}
        <div className="context-mobile-sheet-scroll">
          {isSubView
            ? current.items.map((subItem, si) => (
                subItem.separator ? (
                  <div key={si} className="context-mobile-sheet-separator" role="separator" />
                ) : (
                  <button
                    key={si}
                    type="button"
                    className={`context-mobile-sheet-row${subItem.danger ? ' context-mobile-sheet-row--danger' : ''}${subItem.disabled ? ' is-disabled' : ''}`}
                    disabled={!!subItem.disabled}
                    onClick={(e) => handleSubItemClick(subItem, e)}
                  >
                    {subItem.icon && <span className="context-mobile-sheet-row-icon">{subItem.icon}</span>}
                    <span className="context-mobile-sheet-row-label">
                      {subItem.label}
                      {subItem.description && <span className="context-mobile-sheet-row-desc">{subItem.description}</span>}
                    </span>
                    {subItem.checked != null && (
                      <span className={`context-mobile-sheet-row-check${subItem.checked ? ' is-checked' : ''}`} aria-hidden="true" />
                    )}
                  </button>
                )
              ))
            : current.items.map((item, index) => (
                <SheetRow key={index} item={item} onActivate={handleActivate} />
              ))}
        </div>
      </div>
    </div>,
    document.body,
  );
});

export default ContextMobileSheet;
