import React, { memo } from 'react';
import { ChevronDown, Waves } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import VoiceChannel from './VoiceChannel';
import DMCallView from './DMCallView';
import './VoiceFullscreenOverlay.css';

/**
 * Fullscreen voice/call overlay on mobile.
 * Server voice: real VoiceChannel (stage, streams, participants) — not a static card.
 * DM: DMCallView. Minimize collapses to a compact bar.
 */
const VoiceFullscreenOverlay = memo(function VoiceFullscreenOverlay({ isMobile, conversations }) {
  const { user } = useAuth();
  const {
    voiceChannelId,
    voiceTeamId,
    voiceChannelName,
    voiceConversationId,
    voiceConversationName,
    voiceViewMinimized,
    setVoiceViewMinimized,
    expandedLiveView,
  } = useVoice();

  const isInVoice = voiceChannelId || voiceConversationId;
  const displayName = voiceChannelId ? (voiceChannelName || 'Voice') : (voiceConversationName || 'Call');

  const conversation = conversations?.find(c => c.conversation_id === voiceConversationId);
  const otherUser = conversation?.participants?.find(p => p.id !== user?.id);
  const isGroup = conversation?.is_group;
  const otherUserName = isGroup ? (conversation?.group_name || 'Group') : (otherUser?.display_name || 'Someone');

  if (!isMobile || !isInVoice || expandedLiveView) return null;

  if (voiceViewMinimized) {
    return (
      <button
        type="button"
        className="voice-fullscreen-minimized"
        onClick={() => setVoiceViewMinimized(false)}
        aria-label="Expand voice"
      >
        <span className="voice-fullscreen-minimized-icon" aria-hidden>
          <svg className="voice-fullscreen-wave-icon" viewBox="0 0 32 32" width="22" height="22" fill="none">
            <path
              d="M6 16c0-1.5.4-2.9 1.1-4.1M10 22c-1.8-1.7-3-4.1-3-6.9s1.2-5.2 3-6.9M14 24c-2.5-2.4-4-5.8-4-9.5s1.5-7.1 4-9.5M18 24c2.5-2.4 4-5.8 4-9.5s-1.5-7.1-4-9.5M22 22c1.8-1.7 3-4.1 3-6.9s-1.2-5.2-3-6.9M26 16c0-1.5-.4-2.9-1.1-4.1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="16" cy="16" r="2.2" fill="currentColor" />
          </svg>
        </span>
        <span className="voice-fullscreen-minimized-label">{displayName}</span>
        <ChevronDown size={18} className="voice-fullscreen-minimized-chevron" />
      </button>
    );
  }

  return (
    <div className="voice-fullscreen-overlay voice-fullscreen-overlay--v2">
      <div className="voice-fullscreen-topbar">
        <div className="voice-fullscreen-brand">
          <span className="voice-fullscreen-brand-icon" aria-hidden>
            <Waves size={18} strokeWidth={2.4} />
          </span>
          <span className="voice-fullscreen-brand-text">Voice</span>
        </div>
        <button
          type="button"
          className="voice-fullscreen-minimize"
          onClick={() => setVoiceViewMinimized(true)}
          aria-label="Minimize"
        >
          <ChevronDown size={22} strokeWidth={2.5} />
        </button>
      </div>
      <div className="voice-fullscreen-content voice-fullscreen-content--fill">
        {voiceConversationId ? (
          <DMCallView
            otherUserName={otherUserName}
            otherUser={otherUser}
            isGroup={isGroup}
          />
        ) : voiceChannelId && voiceTeamId != null ? (
          <VoiceChannel
            channel={{
              id: voiceChannelId,
              name: voiceChannelName || 'voice',
              channel_type: 'voice',
            }}
            teamId={String(voiceTeamId)}
            className="voice-channel-view--mobile-overlay"
            defaultShowParticipants
          />
        ) : null}
      </div>
    </div>
  );
});

export default VoiceFullscreenOverlay;
