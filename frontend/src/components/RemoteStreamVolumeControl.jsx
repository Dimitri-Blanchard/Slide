import React, { memo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Volume2 } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useLanguage } from '../context/LanguageContext';
import './RemoteStreamVolumeControl.css';

/**
 * Per-remote-user listening level (0–100), multiplied with Settings → output volume.
 */
export const RemoteStreamVolumeControl = memo(function RemoteStreamVolumeControl({ userId, variant = 'dm' }) {
  const { t } = useLanguage();
  const { getStreamVolumePercent, setStreamVolumeForUser } = useVoice();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [popover, setPopover] = useState(null);

  if (userId == null || userId === '') return null;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPopover(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    setPopover({
      left: rect.left + rect.width / 2,
      bottom: window.innerHeight - rect.top + (variant === 'vc-strip' ? 8 : variant === 'vc-stage' ? 16 : 12),
    });
  }, [open, variant]);

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

  const vol = getStreamVolumePercent(userId);
  const label = t('voice.streamVolume');
  const btnClass =
    variant === 'vc-strip'
      ? 'rsv-btn rsv-btn--strip'
      : variant === 'vc-stage'
        ? 'rsv-btn rsv-btn--stage'
        : 'rsv-btn rsv-btn--dm dm-call-ctrl';

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
      {open && popover && createPortal(
        <div
          className="rsv-popover rsv-popover-portal"
          style={{ left: popover.left, bottom: popover.bottom, transform: 'translateX(-50%)' }}
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
