import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVoice } from '../context/VoiceContext';
import './MicrophoneAccessNotice.css';

export const VOICE_MUTE_TRIGGER_ATTR = 'data-voice-mute-trigger';
const OUTSIDE_DISMISS_MS = 1000;

function findVisibleMuteTrigger() {
  const nodes = document.querySelectorAll(`[${VOICE_MUTE_TRIGGER_ATTR}]`);
  for (const el of nodes) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    return el;
  }
  return null;
}

function measureMuteAnchor() {
  const el = findVisibleMuteTrigger();
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    centerX: rect.left + rect.width / 2,
    top: rect.top,
  };
}

export default function MicrophoneAccessNotice() {
  const { microphoneIssue, dismissMicrophoneIssue, voiceChannelId, voiceConversationId } = useVoice();
  const [anchor, setAnchor] = useState(null);
  const tooltipRef = useRef(null);
  const dismissTimerRef = useRef(null);

  const updateAnchor = useCallback(() => {
    setAnchor(measureMuteAnchor());
  }, []);

  useEffect(() => {
    if (!microphoneIssue) {
      setAnchor(null);
      return undefined;
    }

    updateAnchor();
    const onLayoutChange = () => updateAnchor();
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('scroll', onLayoutChange, true);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onLayoutChange) : null;
    const trigger = findVisibleMuteTrigger();
    if (trigger && ro) ro.observe(trigger);

    return () => {
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('scroll', onLayoutChange, true);
      ro?.disconnect();
    };
  }, [microphoneIssue, updateAnchor, voiceChannelId, voiceConversationId]);

  useEffect(() => {
    if (!microphoneIssue) {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      return undefined;
    }

    const scheduleDismiss = () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = window.setTimeout(() => {
        dismissTimerRef.current = null;
        dismissMicrophoneIssue();
      }, OUTSIDE_DISMISS_MS);
    };

    const onPointerDown = (e) => {
      if (tooltipRef.current?.contains(e.target)) return;
      if (e.target?.closest?.(`[${VOICE_MUTE_TRIGGER_ATTR}]`)) return;
      scheduleDismiss();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [microphoneIssue, dismissMicrophoneIssue]);

  if (!microphoneIssue) return null;

  const style = anchor
    ? {
        left: `${anchor.centerX}px`,
        bottom: `${window.innerHeight - anchor.top + 8}px`,
      }
    : {
        left: '50%',
        bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
      };

  const content = (
    <div
      ref={tooltipRef}
      className={`mic-issue-tooltip${anchor ? '' : ' mic-issue-tooltip--fallback'}`}
      style={style}
      role="alert"
    >
      <span className="mic-issue-text">{microphoneIssue.label}</span>
    </div>
  );

  return createPortal(content, document.body);
}
