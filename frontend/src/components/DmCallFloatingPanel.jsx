import React, { memo, useMemo, useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { GripHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import DMCallView from './DMCallView';
import './DmCallFloatingPanel.css';

const MARGIN = 16;
const POS_STORAGE_KEY = 'slide_dm_float_panel_pos';

function clampPos(left, top, w, h, vw, vh, m = MARGIN) {
  const l = Math.min(Math.max(m, left), Math.max(m, vw - w - m));
  const t = Math.min(Math.max(m, top), Math.max(m, vh - h - m));
  return { left: l, top: t };
}

function snapNearestCorner(left, top, w, h, vw, vh, m = MARGIN) {
  const corners = [
    { left: m, top: m },
    { left: vw - w - m, top: m },
    { left: m, top: vh - h - m },
    { left: vw - w - m, top: vh - h - m },
  ];
  let best = corners[0];
  let bestD = Infinity;
  for (const c of corners) {
    const d = (left - c.left) ** 2 + (top - c.top) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return clampPos(best.left, best.top, w, h, vw, vh, m);
}

function readSavedPos() {
  try {
    const raw = sessionStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.left !== 'number' || typeof p?.top !== 'number') return null;
    return { left: p.left, top: p.top };
  } catch {
    return null;
  }
}

function savePos(left, top) {
  try {
    sessionStorage.setItem(POS_STORAGE_KEY, JSON.stringify({ left, top }));
  } catch {
    /* ignore */
  }
}

/**
 * Desktop: DM call UI when the user is not on that DM route (e.g. stayed on a server after answering).
 * Draggable, snaps to nearest screen corner on release, can collapse to a slim bar.
 */
const DmCallFloatingPanel = memo(function DmCallFloatingPanel({ conversations = [], isMobile }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const {
    voiceConversationId,
    voiceConversationName,
    dmCallCallerId,
    dmFloatingPanelCollapsed,
    setDmFloatingPanelCollapsed,
  } = useVoice();

  const dmMatch = pathname.match(/\/channels\/@me\/(\d+)/);
  const activeDmRouteId = dmMatch?.[1] != null ? parseInt(dmMatch[1], 10) : null;

  const iAmDmCaller =
    dmCallCallerId != null && user?.id != null && Number(dmCallCallerId) === Number(user.id);

  const showFloating =
    !!voiceConversationId &&
    !isMobile &&
    iAmDmCaller &&
    (activeDmRouteId == null || activeDmRouteId !== voiceConversationId);

  const conversation = useMemo(() => {
    if (voiceConversationId == null) return undefined;
    const vid = Number(voiceConversationId);
    return conversations?.find((c) => Number(c.conversation_id) === vid);
  }, [conversations, voiceConversationId]);

  const otherUser = useMemo(
    () => conversation?.participants?.find((p) => p.id !== user?.id),
    [conversation?.participants, user?.id]
  );
  const isGroup = !!conversation?.is_group;
  const groupMembers = conversation?.participants || [];
  const title = isGroup
    ? conversation?.group_name || 'Group'
    : otherUser?.display_name || voiceConversationName || 'Call';

  const rootRef = useRef(null);
  const placedForSessionRef = useRef(false);
  const [pos, setPos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  useLayoutEffect(() => {
    if (!showFloating) {
      setPos(null);
      placedForSessionRef.current = false;
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!placedForSessionRef.current) {
      placedForSessionRef.current = true;
      const saved = readSavedPos();
      if (saved) {
        setPos(clampPos(saved.left, saved.top, w, h, vw, vh));
      } else {
        setPos({ left: vw - w - MARGIN, top: vh - h - MARGIN });
      }
      return;
    }

    setPos((p) => snapNearestCorner(p.left, p.top, w, h, vw, vh));
  }, [showFloating, dmFloatingPanelCollapsed]);

  useEffect(() => {
    if (!showFloating) return;
    const onResize = () => {
      const el = rootRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos((p) => (p == null ? p : clampPos(p.left, p.top, w, h, vw, vh)));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [showFloating]);

  const endDragSnap = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos((p) => {
      const next = snapNearestCorner(p.left, p.top, w, h, vw, vh);
      savePos(next.left, next.top);
      return next;
    });
  }, []);

  const onHeaderPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      const el = rootRef.current;
      if (!el || pos == null) return;
      const r = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = r.left;
      const origTop = r.top;
      setIsDragging(true);

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const next = clampPos(origLeft + dx, origTop + dy, w, h, vw, vh);
        setPos(next);
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        setIsDragging(false);
        endDragSnap();
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [endDragSnap, pos]
  );

  if (!showFloating) return null;

  const transitionStyle = isDragging
    ? 'none'
    : 'left 0.42s cubic-bezier(0.22, 1, 0.36, 1), top 0.42s cubic-bezier(0.22, 1, 0.36, 1)';

  return createPortal(
    <div
      ref={rootRef}
      className={`dm-call-floating-root ${dmFloatingPanelCollapsed ? 'dm-call-floating-root--collapsed' : ''} ${isDragging ? 'dm-call-floating-root--dragging' : ''}`}
      style={
        pos == null
          ? {
              right: MARGIN,
              bottom: MARGIN,
              left: 'auto',
              top: 'auto',
              transition: transitionStyle,
            }
          : {
              left: pos.left,
              top: pos.top,
              right: 'auto',
              bottom: 'auto',
              transition: transitionStyle,
            }
      }
    >
      <div
        className="dm-call-floating-chrome"
        onPointerDown={onHeaderPointerDown}
        role="toolbar"
        aria-label={t('dmCall.floatingToolbar')}
      >
        <span className="dm-call-floating-grip" aria-hidden>
          <GripHorizontal size={18} strokeWidth={2} />
        </span>
        <span className="dm-call-floating-title" title={title}>
          {title}
        </span>
        <button
          type="button"
          className="dm-call-floating-btn"
          onClick={(e) => {
            e.stopPropagation();
            setDmFloatingPanelCollapsed((v) => !v);
          }}
          title={dmFloatingPanelCollapsed ? t('dmCall.expandPanel') : t('dmCall.collapsePanel')}
          aria-expanded={!dmFloatingPanelCollapsed}
        >
          {dmFloatingPanelCollapsed ? <ChevronUp size={18} strokeWidth={2.5} /> : <ChevronDown size={18} strokeWidth={2.5} />}
        </button>
      </div>

      {!dmFloatingPanelCollapsed && (
        <DMCallView
          compact
          hideResize
          otherUserName={title}
          otherUser={otherUser}
          isGroup={isGroup}
          groupMembers={groupMembers}
        />
      )}

      {dmFloatingPanelCollapsed && (
        <div className="dm-call-floating-collapsed-hint">{t('dmCall.collapsedHint')}</div>
      )}
    </div>,
    document.body
  );
});

export default DmCallFloatingPanel;
