import { useState, useRef, useCallback, useEffect } from 'react';

export const RIGHT_PANEL_WIDTH_KEY = 'slide_right_panel_width';
const LEGACY_KEYS = ['slide_members_panel_width', 'slide_dm_profile_sidebar_width'];
const MIN_WIDTH = 240;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 240;
const WIDTH_CHANGE_EVENT = 'slide:right-panel-width';

function clampWidth(value) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

function readStoredWidth() {
  try {
    const stored = localStorage.getItem(RIGHT_PANEL_WIDTH_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n)) {
        const width = clampWidth(n);
        if (width !== n) localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(width));
        return width;
      }
    }
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        const n = parseInt(legacy, 10);
        if (!isNaN(n)) {
          const width = clampWidth(n);
          localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(width));
          return width;
        }
      }
    }
  } catch (_) {}
  return DEFAULT_WIDTH;
}

function persistWidth(width) {
  try {
    localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(width));
  } catch (_) {}
  window.dispatchEvent(new CustomEvent(WIDTH_CHANGE_EVENT, { detail: width }));
}

/** Shared width for MembersPanel (mp-scroll) and DMProfileSidebar (dps-scroll). */
export function useRightPanelWidth() {
  const [width, setWidth] = useState(readStoredWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    const onWidthChange = (e) => {
      const next = e.detail;
      if (typeof next === 'number' && next !== widthRef.current) {
        setWidth(next);
      }
    };
    window.addEventListener(WIDTH_CHANGE_EVENT, onWidthChange);
    return () => window.removeEventListener(WIDTH_CHANGE_EVENT, onWidthChange);
  }, []);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev) => {
      const next = clampWidth(startW + (startX - ev.clientX));
      setWidth(next);
      persistWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return { width, handleResizeStart, MIN_WIDTH, MAX_WIDTH };
}
