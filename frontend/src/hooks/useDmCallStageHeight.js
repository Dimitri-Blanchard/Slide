import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';

export const DM_CALL_STAGE_HEIGHT_KEY = 'slide_dm_call_stage_height';
const DEFAULT_HEIGHT = 210;
const MAX_HEIGHT = 520;
const FALLBACK_MIN = 180;

function getMaxHeight() {
  return Math.min(MAX_HEIGHT, Math.round(window.innerHeight * 0.62));
}

export function measureDmCallStageMin(stageEl) {
  if (!stageEl) return FALLBACK_MIN;
  const root = stageEl.closest('.dm-call');
  const hasVideo = root?.classList.contains('has-video');

  if (hasVideo) {
    const dock = stageEl.querySelector('.dm-call-dock-wrap');
    const meta = stageEl.querySelector('.dm-call-stage-video-meta');
    const dockH = dock?.getBoundingClientRect().height ?? 48;
    const metaH = meta?.getBoundingClientRect().height ?? 28;
    const minVideo = 112;
    return Math.ceil(10 + metaH + minVideo + 10 + dockH + 6);
  }

  const prevHeight = stageEl.style.height;
  const prevMinHeight = stageEl.style.minHeight;
  stageEl.style.height = 'auto';
  stageEl.style.minHeight = '0';
  const natural = stageEl.scrollHeight;
  stageEl.style.height = prevHeight;
  stageEl.style.minHeight = prevMinHeight;
  return Math.max(FALLBACK_MIN, Math.ceil(natural));
}

function clampHeight(value, minHeight) {
  const max = getMaxHeight();
  const min = Math.max(FALLBACK_MIN, minHeight);
  return Math.min(max, Math.max(min, value));
}

function readStoredHeight(minHeight) {
  try {
    const raw = localStorage.getItem(DM_CALL_STAGE_HEIGHT_KEY);
    if (!raw) return clampHeight(DEFAULT_HEIGHT, minHeight);
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return clampHeight(DEFAULT_HEIGHT, minHeight);
    return clampHeight(n, minHeight);
  } catch {
    return clampHeight(DEFAULT_HEIGHT, minHeight);
  }
}

function persistHeight(value) {
  try {
    localStorage.setItem(DM_CALL_STAGE_HEIGHT_KEY, String(value));
  } catch {
    /* ignore */
  }
}

/** Vertical size for embedded / compact DM call stage — drag bottom edge, no resize cursor. */
export function useDmCallStageHeight(enabled, stageRef, measureDeps = []) {
  const [contentMinHeight, setContentMinHeight] = useState(FALLBACK_MIN);
  const [height, setHeight] = useState(() => (enabled ? readStoredHeight(FALLBACK_MIN) : null));
  const heightRef = useRef(height);
  const minRef = useRef(contentMinHeight);
  heightRef.current = height;
  minRef.current = contentMinHeight;

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const stage = stageRef.current;
    if (!stage) return undefined;

    const measure = () => {
      setContentMinHeight(measureDmCallStageMin(stage));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    const dock = stage.querySelector('.dm-call-dock-wrap');
    if (dock) ro.observe(dock);
    const idle = stage.querySelector('.dm-call-stage-idle');
    if (idle) ro.observe(idle);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled, stageRef, ...measureDeps]);

  useEffect(() => {
    if (!enabled) return;
    setHeight((prev) => {
      const next = clampHeight(prev ?? DEFAULT_HEIGHT, contentMinHeight);
      heightRef.current = next;
      if (next !== prev) persistHeight(next);
      return next;
    });
  }, [enabled, contentMinHeight]);

  const handleResizeStart = useCallback((e) => {
    if (!enabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startH = heightRef.current ?? DEFAULT_HEIGHT;

    const onMove = (ev) => {
      const next = clampHeight(startH + (ev.clientY - startY), minRef.current);
      heightRef.current = next;
      setHeight(next);
      persistHeight(next);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.documentElement.classList.remove('dm-call-stage-resizing');
    };

    document.body.style.userSelect = 'none';
    document.documentElement.classList.add('dm-call-stage-resizing');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [enabled]);

  return {
    stageHeight: enabled ? (height ?? DEFAULT_HEIGHT) : null,
    contentMinHeight,
    handleResizeStart,
    maxHeight: MAX_HEIGHT,
  };
}
