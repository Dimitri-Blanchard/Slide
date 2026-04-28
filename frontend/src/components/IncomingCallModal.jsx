import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useLanguage } from '../context/LanguageContext';
import { useSettings } from '../context/SettingsContext';
import { useSounds } from '../context/SoundContext';
import Avatar from './Avatar';
import './IncomingCallModal.css';

export default function IncomingCallModal() {
  const { incomingCall, rejectIncomingCall, joinVoiceDM } = useVoice();
  const { t } = useLanguage();
  const { sendNotification } = useSettings();
  const { startRingtone, stopRingtone } = useSounds();

  useEffect(() => {
    if (!incomingCall) return;
    const callerName = incomingCall.caller?.display_name || 'Someone';
    // OS/desktop notification only when the app is in the background — avoids "tap to join" spam while focused.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      sendNotification(`${callerName} is calling you`, { body: 'Tap to answer', isCall: true });
    }
    startRingtone({ force: true });
    return stopRingtone;
  }, [incomingCall, sendNotification, startRingtone, stopRingtone]);

  if (!incomingCall) return null;

  const { conversationId, caller } = incomingCall;

  const handleAccept = () => {
    stopRingtone();
    joinVoiceDM(conversationId, caller?.display_name);
  };

  const handleDecline = () => {
    stopRingtone();
    rejectIncomingCall(conversationId);
  };

  const name = caller?.display_name || t('chat.someone');

  const banner = (
    <div className="incoming-call-banner-host" role="dialog" aria-label={t('friends.incomingCall', 'Incoming call')}>
      <div className="incoming-call-banner">
        <div className="incoming-call-banner-pulse" aria-hidden />
        <div className="incoming-call-banner-row">
          <div className="incoming-call-banner-avatar-wrap">
            <div className="incoming-call-banner-ring" aria-hidden />
            <Avatar user={caller} size="large" showPresence={false} />
          </div>
          <div className="incoming-call-banner-copy">
            <span className="incoming-call-banner-name">{name}</span>
            <span className="incoming-call-banner-hint">{t('friends.incomingVoiceCallBanner', 'Voice call')}</span>
          </div>
          <div className="incoming-call-banner-actions">
            <button
              type="button"
              className="incoming-call-icon-btn decline"
              onClick={handleDecline}
              title={t('friends.decline')}
              aria-label={t('friends.decline')}
            >
              <PhoneOff size={22} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              className="incoming-call-icon-btn accept"
              onClick={handleAccept}
              title={t('friends.accept')}
              aria-label={t('friends.accept')}
            >
              <Phone size={22} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(banner, document.body);
}
