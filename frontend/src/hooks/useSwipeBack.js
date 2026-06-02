import { useCallback, useEffect, useRef, useState } from 'react';

const SWIPE_THRESHOLD_PX = 64;
const SWIPE_VELOCITY = 0.38;
const AXIS_LOCK_PX = 8;
const HORIZONTAL_RATIO = 1.08;
const EDGE_ZONE_PX = 36;

function rubberBand(offset, limit) {
  const abs = Math.abs(offset);
  const cap = Math.abs(limit);
  if (abs <= cap) return offset;
  const excess = abs - cap;
  return Math.sign(offset) * (cap + excess * 0.18);
}

/**
 * Native navigation swipe — 1:1 finger tracking, velocity fling, spring-back.
 * Sets --swipe-x / --swipe-progress on the host (GPU-friendly).
 */
export function useSwipeBack(onBack, onForward, options = {}) {
  const edgeOnly = options.edgeOnly !== false;
  const hostRef = useRef(null);
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    tracking: false,
    axis: null,
    deltaX: 0,
    fromEdge: false,
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
    const scale = 1 - Math.min(0.04, Math.abs(offsetPx) / window.innerWidth * 0.12);
    el.style.setProperty('--swipe-scale', String(scale));
  }, []);

  const resetSwipeVars = useCallback((animate = true) => {
    const el = hostRef.current;
    if (!el) return;
    if (animate) {
      el.classList.add('is-swipe-releasing');
      el.classList.remove('is-swipe-dragging', 'is-swipe-exiting');
    }
    el.style.setProperty('--swipe-x', '0px');
    el.style.setProperty('--swipe-progress', '0');
    el.style.setProperty('--swipe-scale', '1');
    if (animate) {
      window.setTimeout(() => {
        el.classList.remove('is-swipe-releasing');
      }, 300);
    }
  }, []);

  const runExitThen = useCallback((callback, offsetSign = 1) => {
    const el = hostRef.current;
    if (!el) {
      callback?.();
      return;
    }
    el.classList.remove('is-swipe-dragging', 'is-swipe-releasing');
    el.classList.add('is-swipe-exiting');
    const exitX = Math.min(window.innerWidth * 0.42, 180) * offsetSign;
    setSwipeVars(exitX, 1);
    window.setTimeout(() => {
      callback?.();
      el.classList.remove('is-swipe-exiting');
      el.style.setProperty('--swipe-x', '0px');
      el.style.setProperty('--swipe-progress', '0');
      el.style.setProperty('--swipe-scale', '1');
    }, 240);
  }, [setSwipeVars]);

  useEffect(() => {
    const el = hostEl;
    if (!el || (!onBack && !onForward)) return;

    const maxDrag = () => Math.min(window.innerWidth * 0.88, window.innerWidth - 24);

    const onTouchStart = (e) => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      if (!touch) return;
      const fromEdge = touch.clientX <= EDGE_ZONE_PX;
      if (edgeOnly && onBack && !onForward && !fromEdge) {
        const header = touch.target?.closest?.('.chat-header, .dc-mobile-back, .channel-header');
        if (!header) return;
      }
      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: performance.now(),
        tracking: true,
        axis: null,
        deltaX: 0,
        fromEdge,
      };
      el.classList.remove('is-swipe-releasing', 'is-swipe-exiting');
      resetSwipeVars(false);
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
        const horizontal =
          Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_RATIO ||
          (gestureRef.current.fromEdge && Math.abs(deltaX) > AXIS_LOCK_PX);
        gestureRef.current.axis = horizontal ? 'x' : 'y';
      }

      if (gestureRef.current.axis !== 'x') {
        gestureRef.current.tracking = false;
        resetSwipeVars(true);
        setIsDragging(false);
        return;
      }

      const movingRight = deltaX > 0;
      const movingLeft = deltaX < 0;
      const canGoBack = movingRight && !!onBack;
      const canGoForward = movingLeft && !!onForward;

      if (!canGoBack && !canGoForward) {
        resetSwipeVars(true);
        setIsDragging(false);
        if ((movingLeft && !onForward) || (movingRight && !onBack)) {
          gestureRef.current.tracking = false;
        }
        return;
      }

      const limit = maxDrag();
      const raw = canGoBack ? Math.max(0, deltaX) : Math.min(0, deltaX);
      const offset = rubberBand(raw, limit);
      const progress = Math.abs(raw) / SWIPE_THRESHOLD_PX;

      setSwipeVars(offset, progress);
      el.classList.add('is-swipe-dragging');
      setIsDragging(true);
      e.preventDefault();
    };

    const onTouchEnd = () => {
      const g = gestureRef.current;
      if (g.tracking) {
        const deltaX = g.deltaX || 0;
        const elapsed = Math.max(1, performance.now() - g.startTime);
        const velocity = Math.abs(deltaX) / elapsed;
        const commit =
          Math.abs(deltaX) > SWIPE_THRESHOLD_PX || velocity > SWIPE_VELOCITY;

        if (deltaX > 0 && onBack && commit) {
          runExitThen(onBack, 1);
        } else if (deltaX < 0 && onForward && commit) {
          runExitThen(onForward, -1);
        } else {
          resetSwipeVars(true);
        }
      }
      g.tracking = false;
      g.axis = null;
      g.deltaX = 0;
      el.classList.remove('is-swipe-dragging');
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
  }, [hostEl, onBack, onForward, edgeOnly, resetSwipeVars, runExitThen, setSwipeVars]);

  return {
    hostRef: setHostRef,
    isDragging,
  };
}
