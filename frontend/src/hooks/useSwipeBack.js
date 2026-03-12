import { useCallback, useRef, useState } from 'react';

const SWIPE_THRESHOLD = 112;
const DRAG_FEEDBACK_CAP = 64;
const DRAG_FEEDBACK_RATIO = 0.34;

/**
 * Hook for swipe gestures. Swipe right (→) calls onBack, swipe left (←) calls onForward.
 * Can start from anywhere (no edge requirement). Returns touch handlers, swipe progress,
 * and a horizontal drag offset for subtle "grab" feedback.
 */
export function useSwipeBack(onBack, onForward) {
  const ref = useRef({ startX: 0, startY: 0, tracking: false, axis: null, deltaX: 0 });
  const [progress, setProgress] = useState(0);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = useCallback(
    (e) => {
      if (!onBack && !onForward) return;
      const touch = e.touches[0];
      if (!touch) return;
      ref.current = { startX: touch.clientX, startY: touch.clientY, tracking: true, axis: null, deltaX: 0 };
      setProgress(0);
      setDragOffsetX(0);
      setIsDragging(false);
    },
    [onBack, onForward]
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!ref.current.tracking) return;
      const touch = e.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - ref.current.startX;
      const deltaY = touch.clientY - ref.current.startY;

      ref.current.deltaX = deltaX;

      // Lock gesture axis after a small initial movement.
      if (!ref.current.axis) {
        if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
        ref.current.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.2 ? 'x' : 'y';
      }

      // Let vertical scroll pass through naturally.
      if (ref.current.axis !== 'x') {
        ref.current.tracking = false;
        setProgress(0);
        setDragOffsetX(0);
        setIsDragging(false);
        return;
      }

      const movingRight = deltaX > 0;
      const movingLeft = deltaX < 0;
      const canGoBack = movingRight && !!onBack;
      const canGoForward = movingLeft && !!onForward;

      // If swiping toward an unavailable direction, cancel gesture feedback.
      if (!canGoBack && !canGoForward) {
        setProgress(0);
        setDragOffsetX(0);
        setIsDragging(false);
        if ((movingLeft && !onForward) || (movingRight && !onBack)) {
          ref.current.tracking = false;
        }
        return;
      }

      const absDelta = Math.abs(deltaX);
      const visualOffset = Math.sign(deltaX) * Math.min(DRAG_FEEDBACK_CAP, absDelta * DRAG_FEEDBACK_RATIO);
      setDragOffsetX(visualOffset);
      setProgress(Math.min(1, absDelta / SWIPE_THRESHOLD));
      setIsDragging(true);
      e.preventDefault();
    },
    [onBack, onForward]
  );

  const handleTouchEnd = useCallback(() => {
    if (ref.current.tracking) {
      const deltaX = ref.current.deltaX || 0;
      if (deltaX > SWIPE_THRESHOLD && onBack) {
        onBack();
      } else if (deltaX < -SWIPE_THRESHOLD && onForward) {
        onForward();
      }
    }
    ref.current.tracking = false;
    ref.current.axis = null;
    ref.current.deltaX = 0;
    setProgress(0);
    setDragOffsetX(0);
    setIsDragging(false);
  }, [onBack, onForward]);

  return {
    swipeProgress: progress,
    dragOffsetX,
    isDragging,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };
}
