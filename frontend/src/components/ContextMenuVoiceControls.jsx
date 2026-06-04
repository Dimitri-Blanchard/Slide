import React, { memo, useCallback } from 'react';
import { useVoice } from '../context/VoiceContext';
import { useLanguage } from '../context/LanguageContext';

const preMuteVolumeRef = { current: {} };

/**
 * Volume slider + local mute toggle for voice sidebar user context menus.
 */
export const ContextMenuVoiceControls = memo(function ContextMenuVoiceControls({ userId }) {
  const { t } = useLanguage();
  const { getStreamVolumePercent, setStreamVolumeForUser } = useVoice();
  const vol = getStreamVolumePercent(userId);
  const isMuted = vol === 0;
  const uid = String(userId);

  const stop = useCallback((e) => e.stopPropagation(), []);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      const restore = preMuteVolumeRef.current[uid];
      setStreamVolumeForUser(userId, restore != null && restore > 0 ? restore : 100);
    } else {
      if (vol > 0) preMuteVolumeRef.current[uid] = vol;
      setStreamVolumeForUser(userId, 0);
    }
  }, [isMuted, vol, userId, uid, setStreamVolumeForUser]);

  const volumeLabel = t('voice.userVolume') || 'User Volume';
  const muteLabel = t('voice.muteUser') || 'Mute';

  return (
    <>
      <div
        className="context-menu-custom-row context-menu-volume-row"
        onMouseDown={stop}
        onClick={stop}
      >
        <span className="context-menu-custom-label">{volumeLabel}</span>
        <input
          type="range"
          className="context-menu-volume-slider"
          min={0}
          max={100}
          value={vol}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            if (next > 0) preMuteVolumeRef.current[uid] = next;
            setStreamVolumeForUser(userId, next);
          }}
          aria-label={volumeLabel}
          style={{ '--progress': `${vol}%` }}
        />
      </div>
      <button
        type="button"
        className="context-menu-item context-menu-item--toggle"
        onMouseDown={stop}
        onClick={(e) => {
          e.stopPropagation();
          toggleMute();
        }}
      >
        <span className="context-menu-label">{muteLabel}</span>
        <span className={`context-menu-checkbox${isMuted ? ' checked' : ''}`} aria-hidden="true" />
      </button>
    </>
  );
});
