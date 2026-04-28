import React, { memo, useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { Users, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import { AvatarImg } from './Avatar';
import { useVoice, sameUserId, coercePositiveInt, getRemoteStreamForUser } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { RemoteStreamVolumeControl } from './RemoteStreamVolumeControl';
import './VoiceChannel.css';

const OVERLAY_HIDE_DELAY = 3000;

const ThumbnailVideo = memo(function ThumbnailVideo({ stream, muted = true, listenVolume01 = 1 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  useEffect(() => {
    if (!ref.current || muted) return;
    ref.current.volume = Math.min(1, Math.max(0, listenVolume01));
  }, [listenVolume01, muted]);
  return <video ref={ref} autoPlay playsInline muted={muted} className="vc-thumb-video" />;
});

const VoiceChannel = memo(function VoiceChannel({ channel, teamId, className, defaultShowParticipants = false }) {
  const {
    voiceChannelId, voiceUsers, speakingUsers,
    remoteVideoStreams,
    ownScreenStream, ownCameraStream,
    joinVoice,
    getListenVolume01,
  } = useVoice();
  const { user } = useAuth();

  const [focusedId, setFocusedId] = useState(null);
  const [showParticipants, setShowParticipants] = useState(defaultShowParticipants);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const hideTimerRef = useRef(null);

  const channelNumId = coercePositiveInt(channel?.id);
  const voiceChId = coercePositiveInt(voiceChannelId);
  const isConnected = channelNumId != null && voiceChId === channelNumId;
  const channelUsers =
    (channelNumId != null && voiceUsers[channelNumId]) ||
    (channel?.id != null && voiceUsers[channel.id]) ||
    [];

  // --- Overlay auto-hide (mouse move shows; idle 3s hides) ---
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setOverlayVisible(false);
    }, OVERLAY_HIDE_DELAY);
  }, [clearHideTimer]);

  const showOverlay = useCallback(() => {
    setOverlayVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  // --- Fullscreen ---
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (containerRef.current) await containerRef.current.requestFullscreen();
    } catch (_) {}
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // --- Escape ---
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (showParticipants) setShowParticipants(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showParticipants]);

  // --- Focused participant logic ---
  const effectiveFocusedId = useMemo(() => {
    if (focusedId) {
      const userExists = channelUsers.some(u => sameUserId(u.id, focusedId));
      const streamExists = focusedId === 'self-screen' ? !!ownScreenStream : focusedId === 'self-camera' ? !!ownCameraStream : true;
      if ((userExists || focusedId === 'self-screen' || focusedId === 'self-camera') && streamExists) return focusedId;
    }
    const firstStreamer = channelUsers.find(u => !sameUserId(u.id, user?.id) && getRemoteStreamForUser(remoteVideoStreams, u.id));
    if (firstStreamer) return firstStreamer.id;
    if (ownScreenStream) return 'self-screen';
    if (ownCameraStream) return 'self-camera';
    const firstOther = channelUsers.find(u => !sameUserId(u.id, user?.id));
    if (firstOther) return firstOther.id;
    return channelUsers[0]?.id ?? user?.id;
  }, [focusedId, channelUsers, user?.id, remoteVideoStreams, ownScreenStream, ownCameraStream]);

  const focusedData = useMemo(() => {
    if (effectiveFocusedId === 'self-screen') {
      const self = channelUsers.find(u => sameUserId(u.id, user?.id));
      return { id: 'self-screen', stream: ownScreenStream, displayName: 'Your Screen', avatarUrl: self?.avatar_url, isSelf: true, isSpeaking: false, type: 'screen' };
    }
    if (effectiveFocusedId === 'self-camera') {
      const self = channelUsers.find(u => sameUserId(u.id, user?.id));
      return { id: 'self-camera', stream: ownCameraStream, displayName: 'You', avatarUrl: self?.avatar_url, isSelf: true, isSpeaking: user?.id != null && speakingUsers.has(String(user.id)), type: 'camera' };
    }
    const u = channelUsers.find(u => sameUserId(u.id, effectiveFocusedId));
    if (!u) return null;
    const isSelf = sameUserId(u.id, user?.id);
    return {
      id: u.id,
      stream: isSelf ? null : getRemoteStreamForUser(remoteVideoStreams, u.id) || null,
      displayName: isSelf ? 'You' : u.display_name,
      avatarUrl: u.avatar_url,
      isSelf,
      isSpeaking: u.id != null && speakingUsers.has(String(u.id)),
      type: getRemoteStreamForUser(remoteVideoStreams, u.id) ? 'stream' : 'user',
    };
  }, [effectiveFocusedId, channelUsers, user?.id, remoteVideoStreams, ownScreenStream, ownCameraStream, speakingUsers]);

  const participants = useMemo(() => {
    const list = [];
    channelUsers.forEach(u => {
      if (sameUserId(u.id, effectiveFocusedId) && effectiveFocusedId !== 'self-screen' && effectiveFocusedId !== 'self-camera') return;
      const isSelf = sameUserId(u.id, user?.id);
      const hasStream = isSelf ? !!(ownScreenStream || ownCameraStream) : !!getRemoteStreamForUser(remoteVideoStreams, u.id);
      list.push({
        id: u.id,
        stream: isSelf ? null : getRemoteStreamForUser(remoteVideoStreams, u.id) || null,
        displayName: isSelf ? 'You' : u.display_name,
        avatarUrl: u.avatar_url,
        isSelf,
        isSpeaking: u.id != null && speakingUsers.has(String(u.id)),
        isLive: hasStream,
      });
    });
    if (effectiveFocusedId !== 'self-screen' && ownScreenStream) {
      list.push({ id: 'self-screen', stream: ownScreenStream, displayName: 'Your Screen', avatarUrl: null, isSelf: true, isSpeaking: false, isLive: true, type: 'screen' });
    }
    if (effectiveFocusedId !== 'self-camera' && ownCameraStream) {
      list.push({ id: 'self-camera', stream: ownCameraStream, displayName: 'Your Camera', avatarUrl: null, isSelf: true, isSpeaking: false, isLive: true, type: 'camera' });
    }
    return list;
  }, [channelUsers, user?.id, effectiveFocusedId, remoteVideoStreams, ownScreenStream, ownCameraStream, speakingUsers]);

  // Auto-join when the voice channel view is rendered
  useEffect(() => {
    const cid = coercePositiveInt(channel?.id);
    const tid = coercePositiveInt(teamId);
    if (cid == null || isConnected) return;
    joinVoice(cid, tid ?? 0, channel.name);
  }, [channel?.id, channel?.name, teamId, isConnected, joinVoice]);

  const hasFocusedStream = !!focusedData?.stream;
  const showLivestreamChrome = hasFocusedStream;
  const canShowParticipantsPill = showLivestreamChrome && participants.length > 0;

  // --- Stage video ref callback ---
  const stageVideoRef = useRef(null);
  useEffect(() => {
    if (stageVideoRef.current && focusedData?.stream) {
      stageVideoRef.current.srcObject = focusedData.stream;
      stageVideoRef.current.play().catch(() => {});
    }
  }, [focusedData?.stream]);

  useEffect(() => {
    const el = stageVideoRef.current;
    if (!el || !focusedData?.stream) return;
    if (focusedData.isSelf || focusedData.id === 'self-screen' || focusedData.id === 'self-camera') {
      el.volume = 1;
      return;
    }
    el.volume = getListenVolume01(focusedData.id);
  }, [focusedData?.stream, focusedData?.isSelf, focusedData?.id, getListenVolume01]);

  const showRemoteStreamVol =
    focusedData &&
    hasFocusedStream &&
    !focusedData.isSelf &&
    focusedData.id !== 'self-screen' &&
    focusedData.id !== 'self-camera';

  return (
    <div
      ref={containerRef}
      className={`voice-channel-view ${isFullscreen ? 'is-fullscreen' : ''}${className ? ` ${className}` : ''}`}
      onMouseMove={showOverlay}
      onMouseLeave={scheduleHide}
    >
      {/* Main stage */}
          <div className={`vc-stage ${showParticipants && participants.length > 0 ? 'has-participants' : ''}`}>
            {focusedData?.stream ? (
              <video
                ref={stageVideoRef}
                autoPlay
                playsInline
                muted={focusedData.isSelf}
                className="vc-stage-video"
                style={focusedData.isSelf && focusedData.type === 'camera' ? { transform: 'scaleX(-1)' } : undefined}
              />
            ) : (
              <div className="vc-stage-avatar-display">
                <div className={`vc-stage-avatar ${focusedData?.isSpeaking ? 'speaking' : ''}`}>
                  {focusedData?.avatarUrl ? (
                    <AvatarImg src={focusedData.avatarUrl} alt={focusedData.displayName} />
                  ) : (
                    <span className="vc-stage-avatar-fallback">
                      {(focusedData?.displayName || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="vc-stage-display-name">{focusedData?.displayName}</span>
              </div>
            )}

            {/* Speaking border on the stage */}
            {focusedData?.isSpeaking && <div className="vc-stage-speak-border" />}
          </div>

          {/* Participants strip */}
          {showParticipants && participants.length > 0 && (
            <div className="vc-participants">
              {participants.map(p => (
                <div
                  key={p.id}
                  className={`vc-participant ${p.isSpeaking ? 'speaking' : ''} ${sameUserId(p.id, effectiveFocusedId) ? 'is-focused' : ''}`}
                  onClick={() => setFocusedId(p.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="vc-participant-media">
                    {p.stream ? (
                      <ThumbnailVideo
                        stream={p.stream}
                        muted={p.isSelf}
                        listenVolume01={
                          p.isSelf || p.id === 'self-screen' || p.id === 'self-camera'
                            ? 1
                            : getListenVolume01(p.id)
                        }
                      />
                    ) : (
                      <div className="vc-participant-avatar-wrap">
                        <div className={`vc-participant-avatar ${p.isSpeaking ? 'speaking' : ''}`}>
                          {p.avatarUrl ? (
                            <AvatarImg src={p.avatarUrl} alt={p.displayName} />
                          ) : (
                            <span className="vc-participant-fallback">
                              {(p.displayName || '?').charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="vc-participant-info">
                    <span className="vc-participant-name">{p.displayName}</span>
                    {p.isLive && <span className="vc-participant-live">{p.type === 'screen' ? 'SCREEN' : 'LIVE'}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hover overlay — fades with mouse idle; volume only on main livestream, not in participant strip */}
          <div className={`vc-overlay ${overlayVisible ? 'visible' : ''}`}>
            {focusedData && hasFocusedStream && showRemoteStreamVol && (
              <div className="vc-overlay-stage-vol" onMouseEnter={clearHideTimer}>
                <RemoteStreamVolumeControl userId={focusedData.id} variant="vc-stage" />
              </div>
            )}
            {focusedData && hasFocusedStream && focusedData.id !== 'self-screen' && (
              <div className="vc-overlay-bottom-bar">
                <div className="vc-overlay-username">
                  <span className="vc-overlay-name">{focusedData.isSelf ? 'You' : focusedData.displayName}</span>
                  {focusedData.type === 'stream' && <span className="vc-live-badge">LIVE</span>}
                  {focusedData.type === 'screen' && <span className="vc-live-badge">SCREEN</span>}
                </div>
              </div>
            )}

            {/* Participants: vertical pill (right), only when livestream + mouse-revealed overlay */}
            {canShowParticipantsPill && (
              <div
                className="vc-participants-pill-wrap"
                onMouseEnter={clearHideTimer}
                onMouseLeave={scheduleHide}
              >
                <button
                  type="button"
                  className={`vc-participants-pill ${showParticipants ? 'is-open' : ''}`}
                  onClick={() => setShowParticipants(v => !v)}
                  title={showParticipants ? 'Hide participants' : 'Show participants'}
                  aria-expanded={showParticipants}
                >
                  <Users size={17} strokeWidth={2} />
                  <ChevronDown size={15} strokeWidth={2} className="vc-participants-pill-chevron" aria-hidden />
                </button>
              </div>
            )}

            {/* Fullscreen — only on livestream; fades with overlay (3s after last move) */}
            {showLivestreamChrome && (
              <div
                className="vc-fs-controls"
                onMouseEnter={clearHideTimer}
                onMouseLeave={scheduleHide}
              >
                <button type="button" className="vc-fs-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </div>
            )}
          </div>
    </div>
  );
});

export default VoiceChannel;
