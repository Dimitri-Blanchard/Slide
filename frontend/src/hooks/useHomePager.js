import { useCallback, useEffect, useRef, useState } from 'react';

const SWIPE_THRESHOLD_PX = 64;
const SWIPE_VELOCITY = 0.42;
const AXIS_LOCK_PX = 9;
const HORIZONTAL_RATIO = 1.12;

function rubberBandOffset(offset, canGoBack, canGoForward, pageWidth) {
  const min = canGoForward ? -pageWidth : 0;
  const max = canGoBack ? pageWidth : 0;
  if (offset < min) return min - 0.24 * (min - offset);
  if (offset > max) return max + 0.24 * (offset - max);
  return offset;
}

export function useHomePager({ enabled, pageCount, currentIndex, onPageChange }) {
  const hostRef = useRef(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const isAnimatingRef = useRef(false);
  const offsetRef = useRef(0);
  const pageWidthRef = useRef(0);
  const currentIndexRef = useRef(currentIndex);
  const gestureRef = useRef({
    tracking: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    axis: null,
    startOffset: 0,
  });

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    offsetRef.current = 0;
    setOffset(0);
    setIsDragging(false);
    setIsAnimating(false);
    isAnimatingRef.current = false;
  }, [currentIndex]);

  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);

  useEffect(() => {
    pageWidthRef.current = pageWidth;
  }, [pageWidth]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const width = host.clientWidth || 0;
      if (width > 0) setPageWidth(width);
    };

    measure();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : null;
    observer?.observe(host);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled]);

  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < pageCount - 1;

  const animateTo = useCallback((targetOffset, onDone) => {
    setIsAnimating(true);
    isAnimatingRef.current = true;
    setIsDragging(false);
    setOffset(targetOffset);
    offsetRef.current = targetOffset;

    window.setTimeout(() => {
      setIsAnimating(false);
      isAnimatingRef.current = false;
      onDone?.();
    }, 300);
  }, []);

  const settleGesture = useCallback(() => {
    const width = pageWidthRef.current;
    if (!width) return;

    const currentOffset = offsetRef.current;
    const gesture = gestureRef.current;
    const elapsed = Math.max(1, performance.now() - gesture.startTime);
    const velocity = (currentOffset - gesture.startOffset) / elapsed;

    const commitForward = canGoForward && (
      currentOffset < -SWIPE_THRESHOLD_PX
      || currentOffset < -0.26 * width
      || velocity < -SWIPE_VELOCITY
    );
    const commitBack = canGoBack && (
      currentOffset > SWIPE_THRESHOLD_PX
      || currentOffset > 0.26 * width
      || velocity > SWIPE_VELOCITY
    );

    if (commitBack && (!commitForward || currentOffset > -currentOffset)) {
      animateTo(width, () => {
        offsetRef.current = 0;
        setOffset(0);
        onPageChange?.(currentIndexRef.current - 1);
      });
    } else if (commitForward) {
      animateTo(-width, () => {
        offsetRef.current = 0;
        setOffset(0);
        onPageChange?.(currentIndexRef.current + 1);
      });
    } else {
      animateTo(0);
    }
  }, [animateTo, canGoBack, canGoForward, onPageChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled || pageCount < 2) return;

    const onTouchStart = (event) => {
      if (event.touches.length > 1 || isAnimatingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      if (touch.target?.closest?.(
        'input, textarea, select, button, a, [contenteditable="true"], .modal, .context-menu'
      )) {
        return;
      }

      gestureRef.current = {
        tracking: true,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: performance.now(),
        axis: null,
        startOffset: offsetRef.current,
      };
    };

    const onTouchMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture.tracking) return;

      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      if (!gesture.axis) {
        if (Math.abs(deltaX) < AXIS_LOCK_PX && Math.abs(deltaY) < AXIS_LOCK_PX) return;
        if (Math.abs(deltaY) > HORIZONTAL_RATIO * Math.abs(deltaX)) {
          gesture.tracking = false;
          return;
        }
        gesture.axis = 'x';
        setIsDragging(true);
      }

      const width = pageWidthRef.current || window.innerWidth;
      const index = currentIndexRef.current;
      const nextOffset = rubberBandOffset(
        gesture.startOffset + deltaX,
        index > 0,
        index < pageCount - 1,
        width,
      );

      offsetRef.current = nextOffset;
      setOffset(nextOffset);
      event.preventDefault();
    };

    const onTouchEnd = () => {
      const gesture = gestureRef.current;
      if (gesture.tracking) {
        if (gesture.axis === 'x') settleGesture();
        gesture.tracking = false;
        gesture.axis = null;
        setIsDragging(false);
      }
    };

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
  }, [enabled, pageCount, settleGesture]);

  return {
    hostRef,
    width: pageWidth,
    offset,
    trackX: pageWidth > 0 ? -currentIndex * pageWidth + offset : 0,
    isDragging,
    isAnimating,
  };
}
