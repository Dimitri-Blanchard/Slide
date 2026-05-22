import { useCallback, useEffect, useRef, useState } from 'react';

const SWIPE_THRESHOLD = 88;
const AXIS_LOCK_PX = 10;
const HORIZONTAL_RATIO = 1.15;

function rubberBand(offset, limit) {
  const abs = Math.abs(offset);
  const cap = Math.abs(limit);
  if (abs <= cap) return offset;
  const excess = abs - cap;
  return Math.sign(offset) * (cap + excess * 0.22);
}

/**
 * Native-style horizontal swipe for back / forward navigation on mobile.
 * Uses non-passive touchmove so vertical scroll still works when the gesture is vertical.
 * Drives --swipe-x / --swipe-progress on the host element (no per-frame React state).
 */
export function useSwipeBack(onBack, onForward) {
  const hostRef = useRef(null);
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    tracking: false,
    axis: null,
    deltaX: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [hostEl, setHostEl] = useState(null);

  const setHostRef = useCallback((node) => {
    hostRef.current = node;
    setHostEl(node);
  }, []);

  const setSwipeVars = useCallback((offsetPx, progress) => {
    const el = hostRef.current;
    if (!el) return;
    el.style.setProperty('--swipe-x', `${offsetPx}px`);
    el.style.setProperty('--swipe-progress', String(Math.max(0, Math.min(1, progress))));
  }, []);

  const resetSwipeVars = useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    el.style.setProperty('--swipe-x', '0px');
    el.style.setProperty('--swipe-progress', '0');
  }, []);

  useEffect(() => {
    const el = hostEl;
    if (!el || (!onBack && !onForward)) return;

    const maxDrag = () => Math.min(window.innerWidth * 0.42, 200);

    const onTouchStart = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        tracking: true,
        axis: null,
        deltaX: 0,
      };
      resetSwipeVars();
      setIsDragging(false);
    };

    const onTouchMove = (e) => {
      if (!gestureRef.current.tracking) return;
      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - gestureRef.current.startX;
      const deltaY = touch.clientY - gestureRef.current.startY;
      gestureRef.current.deltaX = deltaX;

      if (!gestureRef.current.axis) {
        if (Math.abs(deltaX) < AXIS_LOCK_PX && Math.abs(deltaY) < AXIS_LOCK_PX) return;
        gestureRef.current.axis =
          Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_RATIO ? 'x' : 'y';
      }

      if (gestureRef.current.axis !== 'x') {
        gestureRef.current.tracking = false;
        resetSwipeVars();
        setIsDragging(false);
        return;
      }

      const movingRight = deltaX > 0;
      const movingLeft = deltaX < 0;
      const canGoBack = movingRight && !!onBack;
      const canGoForward = movingLeft && !!onForward;

      if (!canGoBack && !canGoForward) {
        resetSwipeVars();
        setIsDragging(false);
        if ((movingLeft && !onForward) || (movingRight && !onBack)) {
          gestureRef.current.tracking = false;
        }
        return;
      }

      const limit = maxDrag();
      const offset = canGoBack
        ? rubberBand(Math.max(0, deltaX), limit)
        : rubberBand(Math.min(0, deltaX), -limit);

      setSwipeVars(offset, Math.abs(deltaX) / SWIPE_THRESHOLD);
      setIsDragging(true);
      e.preventDefault();
    };

    const onTouchEnd = () => {
      if (gestureRef.current.tracking) {
        const deltaX = gestureRef.current.deltaX || 0;
        if (deltaX > SWIPE_THRESHOLD && onBack) {
          onBack();
        } else if (deltaX < -SWIPE_THRESHOLD && onForward) {
          onForward();
        }
      }
      gestureRef.current.tracking = false;
      gestureRef.current.axis = null;
      gestureRef.current.deltaX = 0;
      resetSwipeVars();
      setIsDragging(false);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [hostEl, onBack, onForward, resetSwipeVars, setSwipeVars]);

  return {
    hostRef: setHostRef,
    isDragging,
    swipeProgress: 0,
    dragOffsetX: 0,
  };
}
