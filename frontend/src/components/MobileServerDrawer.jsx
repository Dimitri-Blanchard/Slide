import React, { useCallback, useEffect, useRef, useState } from 'react';
import { hapticSelection } from '../utils/nativeHaptics';
import './MobileServerDrawer.css';

const DRAWER_WIDTH_PX = 60;
const EDGE_ZONE_PX = 28;
const OPEN_THRESHOLD_PX = 56;
const OPEN_VELOCITY = 0.4;
const CLOSE_THRESHOLD_PX = 4;
const CLOSE_VELOCITY = 0.4;

function rubberBandOpen(offset, limit) {
  return offset <= limit ? offset : limit + 0.22 * (offset - limit);
}

export default function MobileServerDrawer({
  enabled = true,
  closeSignal,
  drawer,
  children,
}) {
  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const committedOffsetRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const gestureRef = useRef({
    tracking: false,
    fromEdge: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    axis: null,
    drawerOpenAtStart: false,
  });
  const hostRef = useRef(null);

  useEffect(() => {
    setOpen(false);
    committedOffsetRef.current = 0;
    setDragOffset(0);
    setIsDragging(false);
  }, [closeSignal]);

  const closeDrawer = useCallback(() => {
    hapticSelection();
    setOpen(false);
    committedOffsetRef.current = 0;
    setDragOffset(0);
    setIsDragging(false);
  }, []);

  const commitOpenGesture = useCallback((offset, velocity) => {
    if (offset > OPEN_THRESHOLD_PX || velocity > OPEN_VELOCITY) {
      hapticSelection();
      setOpen(true);
      committedOffsetRef.current = 0;
      setDragOffset(0);
    } else {
      setOpen(false);
      committedOffsetRef.current = 0;
      setDragOffset(0);
    }
    setIsDragging(false);
  }, []);

  const onTouchStart = useCallback((event) => {
    if (!enabled || event.touches.length > 1) return;
    const touch = event.touches[0];
    if (!touch) return;

    const fromEdge = touch.clientX <= EDGE_ZONE_PX;
    const onPanel = touch.target?.closest?.('.mobile-server-drawer-panel');
    if (!fromEdge && !(open && onPanel)) return;

    gestureRef.current = {
      tracking: true,
      fromEdge,
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: performance.now(),
      axis: null,
      drawerOpenAtStart: open,
    };
  }, [enabled, open]);

  const onTouchMove = useCallback((event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking) return;

    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;

    if (!gesture.axis) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      if (Math.abs(deltaY) > 1.1 * Math.abs(deltaX)) {
        gesture.tracking = false;
        setIsDragging(false);
        return;
      }
      gesture.axis = 'x';
    }

    let offset;
    if (gesture.drawerOpenAtStart) {
      offset = Math.max(0, Math.min(DRAWER_WIDTH_PX, DRAWER_WIDTH_PX + deltaX));
    } else {
      offset = rubberBandOpen(Math.max(0, deltaX), DRAWER_WIDTH_PX);
    }

    committedOffsetRef.current = offset;
    setDragOffset(offset);
    setIsDragging(true);

    if (offset > 8 || gesture.drawerOpenAtStart) {
      event.preventDefault();
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture.tracking) return;

    const offset = committedOffsetRef.current;
    const elapsed = Math.max(1, performance.now() - gesture.startTime);
    const velocity = Math.abs(offset - (gesture.drawerOpenAtStart ? DRAWER_WIDTH_PX : 0)) / elapsed;

    if (gesture.drawerOpenAtStart) {
      if (offset < CLOSE_THRESHOLD_PX || velocity > CLOSE_VELOCITY) {
        closeDrawer();
      } else {
        setOpen(true);
        committedOffsetRef.current = 0;
        setDragOffset(0);
        setIsDragging(false);
      }
    } else {
      commitOpenGesture(offset, velocity);
    }

    gesture.tracking = false;
    gesture.axis = null;
  }, [closeDrawer, commitOpenGesture]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;

    host.addEventListener('touchstart', onTouchStart, { passive: true });
    host.addEventListener('touchmove', onTouchMove, { passive: false });
    host.addEventListener('touchend', onTouchEnd, { passive: true });
    host.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      host.removeEventListener('touchstart', onTouchStart);
      host.removeEventListener('touchmove', onTouchMove);
      host.removeEventListener('touchend', onTouchEnd);
      host.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, onTouchStart, onTouchMove, onTouchEnd]);

  const panelOffset = open && !isDragging ? DRAWER_WIDTH_PX : dragOffset;
  const overlayOpacity = Math.min(0.45, (panelOffset / DRAWER_WIDTH_PX) * 0.45);

  return (
    <div
      ref={hostRef}
      className={[
        'mobile-server-drawer',
        open ? 'is-open' : '',
        isDragging ? 'is-dragging' : '',
      ].filter(Boolean).join(' ')}
    >
      <aside
        className="mobile-server-drawer-panel"
        style={{ transform: `translate3d(${panelOffset - DRAWER_WIDTH_PX}px, 0, 0)` }}
        aria-hidden={!open && panelOffset < 4}
      >
        {drawer}
      </aside>

      {(open || panelOffset > 4) && (
        <button
          type="button"
          className="mobile-server-drawer-overlay"
          style={{ opacity: overlayOpacity }}
          onClick={closeDrawer}
          aria-label="Fermer le menu serveurs"
        />
      )}

      <div className="mobile-server-drawer-content">
        {children}
      </div>

      {enabled && !open && panelOffset < 4 && (
        <div className="mobile-server-drawer-edge-hint" aria-hidden />
      )}
    </div>
  );
}
