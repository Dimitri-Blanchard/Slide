import React, { memo, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { useVoice, getRemoteStreamForUser } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AppIcon from './icons/AppIcon';
import VoiceChannel from './VoiceChannel';
import DMCallView from './DMCallView';
import VoiceMiniIsland from './VoiceMiniIsland';
import './VoiceFullscreenOverlay.css';

function resolveIslandStream(preview, { remoteVideoStreams, ownScreenStream, ownCameraStream }) {
  if (!preview?.isLive) return null;
  const uid = preview.userId;
  if (uid === 'self-screen') return ownScreenStream;
  if (uid === 'self-camera') return ownCameraStream;
  if (preview.isSelf) return ownCameraStream || ownScreenStream;
  return getRemoteStreamForUser(remoteVideoStreams, uid);
}

const VoiceFullscreenOverlay = memo(function VoiceFullscreenOverlay({ isMobile, conversations }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const {
    voiceChannelId,
    voiceTeamId,
    voiceChannelName,
    voiceConversationId,
    voiceConversationName,
    voiceLeaveAnim,
    voiceViewMinimized,
    setVoiceViewMinimized,
    expandedLiveView,
    voiceMiniIslandPreview,
    remoteVideoStreams,
    ownScreenStream,
    ownCameraStream,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    leaveVoice,
    leaveVoiceDM,
  } = useVoice();

  const isInVoice = voiceChannelId || voiceConversationId || voiceLeaveAnim;
  const displayName = voiceLeaveAnim?.kind === 'channel'
    ? (voiceLeaveAnim.channelName || 'Voice')
    : voiceLeaveAnim?.kind === 'dm'
      ? (voiceLeaveAnim.conversationName || 'Call')
      : voiceChannelId
        ? (voiceChannelName || 'Voice')
        : (voiceConversationName || 'Call');

  const conversation = conversations?.find(c => c.conversation_id === voiceConversationId);
  const otherUser = conversation?.participants?.find(p => p.id !== user?.id);
  const isGroup = !!conversation?.is_group;
  const otherUserName = isGroup ? (conversation?.group_name || 'Group') : (otherUser?.display_name || 'Someone');

  const islandSubject = useMemo(() => {
    const preview = voiceMiniIslandPreview;
    if (preview) {
      return {
        displayName: preview.displayName || displayName,
        avatarUrl: preview.avatarUrl ?? null,
        bannerColor: preview.bannerColor ?? null,
        bannerColor2: preview.bannerColor2 ?? null,
        isLive: !!preview.isLive,
        isSpeaking: !!preview.isSpeaking,
        isSelf: !!preview.isSelf,
        stream: resolveIslandStream(preview, { remoteVideoStreams, ownScreenStream, ownCameraStream }),
      };
    }
    if (voiceConversationId && otherUser && !isGroup) {
      const remoteStream = getRemoteStreamForUser(remoteVideoStreams, otherUser.id);
      if (remoteStream) {
        return {
          displayName: otherUser.display_name || displayName,
          avatarUrl: otherUser.avatar_url ?? null,
          bannerColor: otherUser.banner_color ?? null,
          bannerColor2: otherUser.banner_color_2 ?? null,
          isLive: true,
          isSpeaking: false,
          isSelf: false,
          stream: remoteStream,
        };
      }
      return {
        displayName: otherUser.display_name || displayName,
        avatarUrl: otherUser.avatar_url ?? null,
        bannerColor: otherUser.banner_color ?? null,
        bannerColor2: otherUser.banner_color_2 ?? null,
        isLive: false,
        isSpeaking: false,
        isSelf: false,
        stream: null,
      };
    }
    return {
      displayName,
      avatarUrl: null,
      isLive: false,
      isSpeaking: false,
      isSelf: false,
      stream: null,
    };
  }, [
    voiceMiniIslandPreview,
    displayName,
    voiceConversationId,
    otherUser,
    isGroup,
    remoteVideoStreams,
    ownScreenStream,
    ownCameraStream,
  ]);

  if (!isMobile || !isInVoice || expandedLiveView) return null;

  const isLeaving = !!voiceLeaveAnim;
  const isServerVoice = !!voiceChannelId || voiceLeaveAnim?.kind === 'channel';
  const leaveCurrentVoice = (e) => {
    e?.stopPropagation?.();
    if (isLeaving) return;
    if (isServerVoice) leaveVoice();
    else leaveVoiceDM();
  };

  const controls = (
    <div className="voice-fullscreen-control-dock" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`voice-fullscreen-control${isMuted ? ' is-active' : ''}`}
        data-voice-mute-trigger
        onClick={toggleMute}
        disabled={isLeaving}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <AppIcon name="micOff" size={20} /> : <AppIcon name="mic" size={20} />}
      </button>
      <button
        type="button"
        className={`voice-fullscreen-control${isDeafened ? ' is-active' : ''}`}
        onClick={toggleDeafen}
        disabled={isLeaving}
        aria-label={isDeafened ? 'Undeafen' : 'Deafen'}
      >
        {isDeafened ? <AppIcon name="deafenOff" size={20} /> : <AppIcon name="deafen" size={20} />}
      </button>
      <button
        type="button"
        className="voice-fullscreen-control voice-fullscreen-control--leave"
        onClick={leaveCurrentVoice}
        disabled={isLeaving}
        aria-label="Leave voice"
      >
        <AppIcon name="phoneOff" size={21} />
      </button>
    </div>
  );

  if (voiceViewMinimized) {
    return (
      <VoiceMiniIsland
        displayName={islandSubject.displayName}
        isLive={islandSubject.isLive}
        avatarUrl={islandSubject.avatarUrl}
        stream={islandSubject.stream}
        isSpeaking={islandSubject.isSpeaking}
        isSelf={islandSubject.isSelf}
        onExpand={() => setVoiceViewMinimized(false)}
      />
    );
  }

  return (
    <div className={`voice-fullscreen-overlay voice-fullscreen-overlay--v2${voiceLeaveAnim ? ' voice-fullscreen-overlay--exiting' : ''}`}>
      <div className="voice-fullscreen-topbar">
        <div className="voice-fullscreen-brand">
          <span className="voice-fullscreen-brand-text">Voice</span>
        </div>
        <button
          type="button"
          className="voice-fullscreen-minimize"
          onClick={() => setVoiceViewMinimized(true)}
          aria-label={t('voice.minimizeVoice') || 'Minimize'}
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
      {isServerVoice ? controls : null}
    </div>
  );
});

export default VoiceFullscreenOverlay;
