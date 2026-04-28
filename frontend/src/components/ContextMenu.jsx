import React, { useEffect, useRef, memo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './ContextMenu.css';

// SVG Icons for context menu
const Icons = {
  profile: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  ),
  pin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22"></line>
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
    </svg>
  ),
  unpin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22"></line>
      <line x1="12" y1="17" x2="12" y2="22"></line>
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12"></path>
      <path d="M15 9.34V6h1a2 2 0 0 0 0-4H7.89"></path>
    </svg>
  ),
  delete: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
    </svg>
  ),
  phone: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
    </svg>
  ),
  checkRead: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16 17 21.34 24 14l-1.41-1.41L17 18.66l-5.34-5.34-1.41 1.41 6.34 6.34zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 4l-4 4 4 4 1.41-1.41L13.41 7 19.41 1 18 4zm-8 0L2 12l8 8 1.41-1.41L4.83 12 11.41 5.5 10 4z"/>
    </svg>
  ),
  note: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  copy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
    </svg>
  ),
  invite: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0 2c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z"/>
    </svg>
  ),
  message: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
};

const ContextMenu = memo(function ContextMenu({ x, y, items, onClose, onHoverFlyout, ignoreClickRefs = [] }) {
  const menuRef = useRef(null);
  const [submenuOpen, setSubmenuOpen] = useState(null);
  const submenuRef = useRef(null);
  const hoverFlyoutTimeoutRef = useRef(null);
  const submenuCloseTimerRef = useRef(null);
  const [hoverFlyoutIndex, setHoverFlyoutIndex] = useState(null);

  const FLYOUT_DELAY = 150;

  const openSubmenu = useCallback((index) => {
    if (submenuCloseTimerRef.current) {
      clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
    setSubmenuOpen(index);
  }, []);

  const closeSubmenuDelayed = useCallback(() => {
    if (submenuCloseTimerRef.current) clearTimeout(submenuCloseTimerRef.current);
    submenuCloseTimerRef.current = setTimeout(() => {
      setSubmenuOpen(null);
      submenuCloseTimerRef.current = null;
    }, 200);
  }, []);

  const clearFlyoutTimer = useCallback(() => {
    if (hoverFlyoutTimeoutRef.current) {
      clearTimeout(hoverFlyoutTimeoutRef.current);
      hoverFlyoutTimeoutRef.current = null;
    }
  }, []);

  const handleHoverFlyoutEnter = useCallback((item, index) => {
    clearFlyoutTimer();
    setHoverFlyoutIndex(index);
    const rect = menuRef.current?.getBoundingClientRect();
    onHoverFlyout?.(item, true, rect);
  }, [onHoverFlyout, clearFlyoutTimer]);

  const handleHoverFlyoutLeave = useCallback((item) => {
    // Parent handles delay so user can move to flyout; call immediately
    onHoverFlyout?.(item, false);
    setHoverFlyoutIndex(null);
  }, [onHoverFlyout]);

  const handleFlyoutKeepOpen = useCallback((item) => {
    clearFlyoutTimer();
    onHoverFlyout?.(item, true);
  }, [onHoverFlyout, clearFlyoutTimer]);

  const handleFlyoutClose = useCallback((item) => {
    hoverFlyoutTimeoutRef.current = setTimeout(() => {
      setHoverFlyoutIndex(null);
      onHoverFlyout?.(item, false);
      hoverFlyoutTimeoutRef.current = null;
    }, FLYOUT_DELAY);
  }, [onHoverFlyout]);

  useEffect(() => () => {
    clearFlyoutTimer();
    if (submenuCloseTimerRef.current) clearTimeout(submenuCloseTimerRef.current);
  }, [clearFlyoutTimer]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      const inMenu = menuRef.current?.contains(e.target);
      const inSubmenu = submenuRef.current?.contains(e.target);
      const inIgnore = ignoreClickRefs.some(ref => ref?.current?.contains(e.target));
      if (!inMenu && !inSubmenu && !inIgnore) onClose();
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setSubmenuOpen(null);
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, submenuOpen, ignoreClickRefs]);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [x, y]);

  const handleItemClick = (item, event) => {
    if (item.submenu) return;
    if (item.hoverFlyout && !item.onClick) return;
    if (!item.disabled) {
      item.onClick?.(event);
      onClose();
    }
  };

  const handleSubmenuItemClick = (subItem) => {
    subItem.onClick?.();
    setSubmenuOpen(null);
    onClose();
  };

  return createPortal(
    <>
      <div 
        className="context-menu" 
        ref={menuRef}
        style={{ left: x, top: y }}
      >
        {items.map((item, index) => (
          item.separator ? (
            <div key={index} className="context-menu-separator" />
          ) : (
            <div
              key={index}
              className={`context-menu-item-wrap ${item.submenu ? 'has-submenu' : ''} ${item.hoverFlyout ? 'has-flyout' : ''}`}
              onMouseEnter={() => {
                if (item.hoverFlyout) handleHoverFlyoutEnter(item, index);
                else if (item.submenu) openSubmenu(index);
              }}
              onMouseLeave={() => {
                if (item.hoverFlyout) handleHoverFlyoutLeave(item);
                else if (item.submenu) closeSubmenuDelayed();
              }}
            >
              <button
                className={`context-menu-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}`}
                onClick={(e) => handleItemClick(item, e)}
                disabled={item.disabled}
              >
                {item.icon && <span className="context-menu-icon">{item.icon}</span>}
                <span className="context-menu-label">{item.label}</span>
                {(item.submenu || item.hoverFlyout) && <span className="context-menu-chevron">{Icons.chevronRight}</span>}
              </button>
              {item.submenu && submenuOpen === index && (
                <div
                  ref={submenuRef}
                  className="context-menu-submenu"
                  onMouseEnter={() => openSubmenu(index)}
                  onMouseLeave={() => closeSubmenuDelayed()}
                >
                  {item.submenu.map((subItem, si) => (
                    subItem.separator ? (
                      <div key={si} className="context-menu-separator" />
                    ) : (
                      <button
                        key={si}
                        className="context-menu-item"
                        onClick={() => handleSubmenuItemClick(subItem)}
                      >
                        {subItem.icon && <span className="context-menu-icon">{subItem.icon}</span>}
                        <span className="context-menu-label">
                          {subItem.label}
                          {subItem.description && <span className="context-menu-item-desc">{subItem.description}</span>}
                        </span>
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )
        ))}
      </div>
    </>,
    document.body
  );
});

// Export Icons for use in other components
export { Icons };
export default ContextMenu;
