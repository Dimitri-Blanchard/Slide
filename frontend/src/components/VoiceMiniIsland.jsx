import React, { memo, useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AvatarImg } from './Avatar';
import { hapticImpact } from '../utils/nativeHaptics';
import { useAvatarBlendColor } from '../hooks/useAvatarBlendColor';
import { IslandPreviewVideo } from './VoiceMiniIslandMedia';
import './VoiceFullscreenOverlay.css';

const POS_STORAGE_KEY = 'slide_voice_mini_island_corner';
const DRAG_THRESHOLD = 6;
const MARGIN = 12;

function readNavBottomInset() {
  if (typeof document === 'undefined') return 68;
  const root = document.documentElement;
  const nav = parseFloat(getComputedStyle(root).getPropertyValue('--mobile-nav-bar-height')) || 56;
  const safe = parseFloat(getComputedStyle(root).getPropertyValue('--inset-bottom')) || 0;
  return nav + safe + 8;
}

function getCornerAnchors(w, h, vw, vh, navBottom) {
  const maxTop = vh - h - navBottom;
  return {
    tl: { left: MARGIN, top: MARGIN },
    tr: { left: vw - w - MARGIN, top: MARGIN },
    bl: { left: MARGIN, top: maxTop },
    br: { left: vw - w - MARGIN, top: maxTop },
  };
}

function nearestCorner(left, top, w, h, vw, vh, navBottom) {
  const anchors = getCornerAnchors(w, h, vw, vh, navBottom);
  const cx = left + w / 2;
  const cy = top + h / 2;
  let best = anchors.br;
  let bestD = Infinity;
  for (const anchor of Object.values(anchors)) {
    const ax = anchor.left + w / 2;
    const ay = anchor.top + h / 2;
    const d = (cx - ax) ** 2 + (cy - ay) ** 2;
    if (d < bestD) {
      bestD = d;
      best = anchor;
    }
  }
  return best;
}

function clampDrag(left, top, w, h, vw, vh, navBottom) {
  const maxTop = vh - h - navBottom;
  return {
    left: Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - w - MARGIN)),
    top: Math.min(Math.max(MARGIN, top), Math.max(MARGIN, maxTop)),
  };
}

function readSavedCorner() {
  try {
    const raw = sessionStorage.getItem(POS_STORAGE_KEY);
    if (raw === 'tl' || raw === 'tr' || raw === 'bl' || raw === 'br') return raw;
    return null;
  } catch {
    return null;
  }
}

function saveCorner(corner) {
  try {
    sessionStorage.setItem(POS_STORAGE_KEY, corner);
  } catch {
    /* ignore */
  }
}

function cornerToPos(corner, w, h, vw, vh, navBottom) {
  const anchors = getCornerAnchors(w, h, vw, vh, navBottom);
  return anchors[corner] || anchors.br;
}

function posToCorner(left, top, w, h, vw, vh, navBottom) {
  const anchors = getCornerAnchors(w, h, vw, vh, navBottom);
  let bestKey = 'br';
  let bestD = Infinity;
  for (const [key, anchor] of Object.entries(anchors)) {
    const d = (left - anchor.left) ** 2 + (top - anchor.top) ** 2;
    if (d < bestD) {
      bestD = d;
      bestKey = key;
    }
  }
  return bestKey;
}

const VoiceMiniIsland = memo(function VoiceMiniIsland({
  displayName,
  isLive,
  avatarUrl,
  stream,
  isSpeaking,
  isSelf,
  onExpand,
}) {
  const rootRef = useRef(null);
  const placedRef = useRef(false);
  const dragMovedRef = useRef(false);
  const [pos, setPos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const showLive = isLive && stream;
  const avatarBlendColor = useAvatarBlendColor(showLive ? null : avatarUrl);
  const initial = (displayName || '?').charAt(0).toUpperCase();

  const placeAtCorner = useCallback((corner, instant = false) => {
    const el = rootRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const navBottom = readNavBottomInset();
    const next = cornerToPos(corner, w, h, vw, vh, navBottom);
    setPos(next);
    if (instant) saveCorner(corner);
  }, []);

  const snapPos = useCallback((current) => {
    const el = rootRef.current;
    if (!el || !current) return current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const navBottom = readNavBottomInset();
    const next = nearestCorner(current.left, current.top, w, h, vw, vh, navBottom);
    saveCorner(posToCorner(next.left, next.top, w, h, vw, vh, navBottom));
    return next;
  }, []);

  useLayoutEffect(() => {
    if (placedRef.current) return;
    placedRef.current = true;
    const el = rootRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const navBottom = readNavBottomInset();
    const saved = readSavedCorner();
    const next = cornerToPos(saved || 'br', w, h, vw, vh, navBottom);
    setPos(next);
  }, []);

  useLayoutEffect(() => {
    if (!placedRef.current || pos == null) return;
    const el = rootRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const navBottom = readNavBottomInset();
    const corner = readSavedCorner() || posToCorner(pos.left, pos.top, w, h, vw, vh, navBottom);
    setPos(cornerToPos(corner, w, h, vw, vh, navBottom));
  }, [isLive]);

  useEffect(() => {
    const onResize = () => {
      const saved = readSavedCorner() || 'br';
      placeAtCorner(saved);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [placeAtCorner]);

  const onIslandPointerDown = useCallback(
    (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      const el = rootRef.current;
      if (!el || pos == null) return;

      dragMovedRef.current = false;
      setIsDragging(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = pos.left;
      const origTop = pos.top;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          dragMovedRef.current = true;
        }
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const navBottom = readNavBottomInset();
        setPos(clampDrag(origLeft + dx, origTop + dy, w, h, vw, vh, navBottom));
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        setIsDragging(false);
        if (dragMovedRef.current) {
          hapticImpact('Light');
          setPos((current) => snapPos(current));
        } else {
          hapticImpact('Medium');
          onExpand?.();
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [onExpand, pos, snapPos],
  );

  const mediaStyle = showLive ? undefined : { backgroundColor: avatarBlendColor };

  return createPortal(
    <div
      ref={rootRef}
      className={`voice-mini-island${showLive ? ' voice-mini-island--live' : ' voice-mini-island--avatar'}${isDragging ? ' is-dragging' : ''}${isSpeaking ? ' is-speaking' : ''}`}
      style={
        pos == null
          ? { visibility: 'hidden' }
          : {
              left: pos.left,
              top: pos.top,
              right: 'auto',
              bottom: 'auto',
              transform: 'none',
            }
      }
      role="button"
      tabIndex={0}
      aria-label={displayName}
      onPointerDown={onIslandPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand?.();
        }
      }}
    >
      <div className="voice-mini-island-media" style={mediaStyle}>
        {showLive ? (
          <IslandPreviewVideo stream={stream} muted={!!isSelf} />
        ) : (
          <div className="voice-mini-island-avatar-wrap">
            {avatarUrl ? (
              <AvatarImg src={avatarUrl} alt="" className="voice-mini-island-avatar-img" />
            ) : (
              <span className="voice-mini-island-avatar-fallback" aria-hidden>{initial}</span>
            )}
          </div>
        )}
      </div>
      {isSpeaking && <span className="voice-mini-island-speaking-ring" aria-hidden />}
    </div>,
    document.body,
  );
});

export default VoiceMiniIsland;
