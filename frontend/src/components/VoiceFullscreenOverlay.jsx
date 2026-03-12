import React, { memo } from 'react';
import { ChevronDown, Phone, Radio, Users } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import VoiceUserProfileBar from './VoiceUserProfileBar';
import DMCallView from './DMCallView';
import './VoiceFullscreenOverlay.css';

/**
 * Fullscreen voice/call overlay on mobile.
 * When in a voice channel or DM call: fullscreen by default.
 * Minimize button collapses to a compact bar; tapping bar expands again.
 */
const VoiceFullscreenOverlay = memo(function VoiceFullscreenOverlay({ isMobile, conversations }) {
  const { user } = useAuth();
  const {
    voiceChannelId,
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
        <span className="voice-fullscreen-minimized-icon">
          <Phone size={18} strokeWidth={2} />
        </span>
        <span className="voice-fullscreen-minimized-label">{displayName}</span>
        <ChevronDown size={18} className="voice-fullscreen-minimized-chevron" />
      </button>
    );
  }

  return (
    <div className="voice-fullscreen-overlay">
      <button
        type="button"
        className="voice-fullscreen-minimize"
        onClick={() => setVoiceViewMinimized(true)}
        aria-label="Minimize"
      >
        <ChevronDown size={24} strokeWidth={2.5} />
      </button>
      <div className="voice-fullscreen-content">
        {voiceConversationId ? (
          <DMCallView
            otherUserName={otherUserName}
            otherUser={otherUser}
            isGroup={isGroup}
          />
        ) : (
          <div className="voice-fullscreen-channel">
            <div className="voice-fullscreen-channel-orb" aria-hidden="true" />
            <div className="voice-fullscreen-channel-shell">
              <div className="voice-fullscreen-channel-pill">
                <Radio size={14} strokeWidth={2.5} />
                <span>Live voice channel</span>
              </div>
              <div className="voice-fullscreen-channel-info">
                <h2 className="voice-fullscreen-channel-title">#{displayName}</h2>
                <p className="voice-fullscreen-channel-desc">
                  You are connected and ready to talk with your team.
                </p>
              </div>
              <div className="voice-fullscreen-channel-stats">
                <div className="voice-fullscreen-channel-stat">
                  <Phone size={15} strokeWidth={2.3} />
                  <span>Connected</span>
                </div>
                <div className="voice-fullscreen-channel-stat">
                  <Users size={15} strokeWidth={2.3} />
                  <span>Channel room</span>
                </div>
              </div>
              <VoiceUserProfileBar />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default VoiceFullscreenOverlay;
