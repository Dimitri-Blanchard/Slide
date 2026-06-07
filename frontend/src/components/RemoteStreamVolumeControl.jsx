import React, { memo, useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Volume2 } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useLanguage } from '../context/LanguageContext';
import { computeAnchoredPopoverStyle } from '../utils/popoverPlacement';
import './RemoteStreamVolumeControl.css';

const GAP_BY_VARIANT = { 'vc-strip': 8, 'vc-stage': 16, dm: 12 };

/**
 * Per-remote-user live/screen-share level (0–100), multiplied with Settings → output volume.
 * Does not affect microphone voice level.
 */
export const RemoteStreamVolumeControl = memo(function RemoteStreamVolumeControl({ userId, variant = 'dm' }) {
  const { t } = useLanguage();
  const { getStreamVolumePercent, setStreamVolumeForUser } = useVoice();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popoverRef = useRef(null);
  const [popover, setPopover] = useState(null);

  const updatePopoverPosition = useCallback(() => {
    if (!open || !btnRef.current) {
      setPopover(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const gap = GAP_BY_VARIANT[variant] ?? 12;
    const measured = popoverRef.current?.offsetHeight;
    const style = computeAnchoredPopoverStyle(rect, {
      gap,
      estimatedHeight: measured && measured > 0 ? measured : 132,
    });
    setPopover(style);
  }, [open, variant]);

  useLayoutEffect(() => {
    updatePopoverPosition();
    if (!open) return undefined;
    const id = requestAnimationFrame(() => updatePopoverPosition());
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [open, updatePopoverPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (e.target.closest('.rsv-popover')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (userId == null || userId === '') return null;

  const vol = getStreamVolumePercent(userId);
  const label = t('voice.streamVolume');
  const btnClass =
    variant === 'vc-strip'
      ? 'rsv-btn rsv-btn--strip'
      : variant === 'vc-stage'
        ? 'rsv-btn rsv-btn--stage'
        : 'rsv-btn rsv-btn--dm dm-call-ctrl';

  const popoverStyle = popover
    ? {
        left: popover.left,
        transform: 'translateX(-50%)',
        ...(popover.openAbove
          ? { bottom: popover.bottom }
          : { top: popover.top }),
      }
    : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${btnClass}${open ? ' active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={label}
        aria-expanded={open}
        aria-label={label}
      >
        <Volume2 size={variant === 'vc-strip' ? 14 : variant === 'vc-stage' ? 18 : 20} strokeWidth={2} />
      </button>
      {open && popoverStyle && createPortal(
        <div
          ref={popoverRef}
          className={`rsv-popover rsv-popover-portal${popover.openAbove ? '' : ' rsv-popover--below'}`}
          style={popoverStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="rsv-label">{label}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => setStreamVolumeForUser(userId, e.target.valueAsNumber)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={vol}
          />
          <span className="rsv-value">{vol}%</span>
        </div>,
        document.body
      )}
    </>
  );
});
