import React, { memo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Volume2 } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useSettings } from '../context/SettingsContext';
import './ScreenShareVolumeControl.css';

/**
 * Button + popover to adjust level of system/tab audio sent with screen share (when capture audio is active).
 */
export const ScreenShareVolumeControl = memo(function ScreenShareVolumeControl({ variant = 'vsb' }) {
  const { isScreenSharing, screenShareCaptureAudioActive, setScreenShareCaptureVolume } = useVoice();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [popover, setPopover] = useState(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPopover(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    setPopover({
      left: rect.left + rect.width / 2,
      bottom: window.innerHeight - rect.top + (variant === 'dm' ? 12 : 20),
    });
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (e.target.closest('.ssc-vol-popover')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!isScreenSharing || !screenShareCaptureAudioActive) return null;

  const vol = settings?.screen_share_capture_volume ?? 100;
  const btnClass = variant === 'dm' ? 'ssc-vol-btn ssc-vol-btn--dm dm-call-ctrl' : 'ssc-vol-btn ssc-vol-btn--vsb vsb-btn';

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
        title="Volume du son du stream"
        aria-expanded={open}
        aria-label="Volume du son du stream"
      >
        <Volume2 size={variant === 'dm' ? 20 : 18} strokeWidth={2} />
      </button>
      {open && popover && createPortal(
        <div
          className="ssc-vol-popover ssc-vol-popover-portal"
          style={{ left: popover.left, bottom: popover.bottom, transform: 'translateX(-50%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="ssc-vol-label">Son du stream</span>
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => setScreenShareCaptureVolume(e.target.valueAsNumber)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={vol}
          />
          <span className="ssc-vol-value">{vol}%</span>
        </div>,
        document.body
      )}
    </>
  );
});

export default ScreenShareVolumeControl;
