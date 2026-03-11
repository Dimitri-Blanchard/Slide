import { useCallback, useRef, useState } from 'react';

const SWIPE_THRESHOLD = 56;
const PROGRESS_SCALE = 80;

/**
 * Hook for swipe gestures. Swipe right (→) calls onBack, swipe left (←) calls onForward.
 * Can start from anywhere (no edge requirement). Returns touch handlers and swipe progress.
 */
export function useSwipeBack(onBack, onForward) {
  const ref = useRef({ startX: 0, startY: 0, tracking: false });
  const [progress, setProgress] = useState(0);

  const handleTouchStart = useCallback(
    (e) => {
      if (!onBack && !onForward) return;
      const touch = e.touches[0];
      if (!touch) return;
      ref.current = { startX: touch.clientX, startY: touch.clientY, tracking: true };
      setProgress(0);
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
      // Require predominantly horizontal swipe (not vertical scroll)
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.8) {
        ref.current.tracking = false;
        setProgress(0);
        return;
      }
      // Swipe right: go back
      if (deltaX > 0 && onBack) {
        const p = Math.min(1, deltaX / PROGRESS_SCALE);
        setProgress(p);
        if (deltaX > SWIPE_THRESHOLD) {
          onBack();
          ref.current.tracking = false;
          setProgress(0);
        }
        return;
      }
      // Swipe left: go forward (e.g. back to channel)
      if (deltaX < 0 && onForward) {
        const p = Math.min(1, -deltaX / PROGRESS_SCALE);
        setProgress(p);
        if (-deltaX > SWIPE_THRESHOLD) {
          onForward();
          ref.current.tracking = false;
          setProgress(0);
        }
      } else if (deltaX < -20 && !onForward) {
        ref.current.tracking = false;
        setProgress(0);
      }
    },
    [onBack, onForward]
  );

  const handleTouchEnd = useCallback(() => {
    ref.current.tracking = false;
    setProgress(0);
  }, []);

  return {
    swipeProgress: progress,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
