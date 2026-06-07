import { useRef, useCallback } from 'react';

/** Long-press (touch) / hold — opens mobile action sheets instead of right-click. */
export function useLongPress(onLongPress, options = {}) {
  const {
    delay = 500,
    moveThreshold = 10,
    disabled = false,
  } = options;

  const timerRef = useRef(null);
  const startRef = useRef(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback((e) => {
    if (disabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    firedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    const cx = e.clientX;
    const cy = e.clientY;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startRef.current = null;
      firedRef.current = true;
      onLongPress?.({
        clientX: cx,
        clientY: cy,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    }, delay);
  }, [disabled, onLongPress, delay]);

  const onPointerMove = useCallback((e) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > moveThreshold * moveThreshold) clear();
  }, [clear, moveThreshold]);

  const onPointerUp = useCallback(() => clear(), [clear]);

  const onContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  const shouldSkipClick = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    longPressProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onContextMenu,
    },
    shouldSkipClick,
    longPressFiredRef: firedRef,
  };
}
