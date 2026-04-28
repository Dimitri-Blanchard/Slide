import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, Headphones, HeadphoneOff, PhoneOff, ChevronDown, LayoutGrid, UserCircle2, Phone } from 'lucide-react';
import { AvatarImg } from './Avatar';
import { useVoice, sameUserId } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useSounds } from '../context/SoundContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useTranslation } from '../context/LanguageContext';
import { ScreenShareVolumeControl } from './ScreenShareVolumeControl';
import { RemoteStreamVolumeControl } from './RemoteStreamVolumeControl';
import './DMCallView.css';

const VideoTile = memo(function VideoTile({ stream, muted = true, label, isSelf, volumeUserId, listenVolume01 = 1 }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!videoRef.current || muted) return;
    videoRef.current.volume = Math.min(1, Math.max(0, listenVolume01));
  }, [listenVolume01, muted]);

  if (!stream) return null;

  return (
    <div className={`dm-call-video-tile ${isSelf ? 'self' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{ transform: isSelf ? 'scaleX(-1)' : 'none' }}
      />
      {label && <span className="dm-call-video-label">{label}</span>}
      {volumeUserId != null && !isSelf && (
        <div className="dm-call-video-tile-vol" onClick={(e) => e.stopPropagation()}>
          <RemoteStreamVolumeControl userId={volumeUserId} variant="dm" />
        </div>
      )}
    </div>
  );
});

const CallAvatar = memo(function CallAvatar({ voiceUser, isSpeaking, state, size = 'normal', showName = true, isSelf }) {
  const name = isSelf ? 'You' : (voiceUser.display_name || (voiceUser.id === 'placeholder' ? null : 'Someone'));
  return (
    <div className={`dm-call-avatar-card ${size}`}>
      <div className={`dm-call-avatar-wrapper ${isSpeaking ? 'speaking' : ''} state-${state} size-${size}`}>
        {state === 'connecting' && <span className="dm-call-spinner" />}
        {isSpeaking && <span className="dm-call-speak-glow" />}
        <div className="dm-call-avatar-circle">
          {voiceUser.avatar_url ? (
            <AvatarImg src={voiceUser.avatar_url} alt={voiceUser.display_name} />
          ) : (
            <span className="dm-call-avatar-fallback">
              {(voiceUser.display_name || '?').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>
      {showName && name && <span className="dm-call-avatar-name">{name}</span>}
    </div>
  );
});

function useCallTimer(isConnected) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isConnected) { setSeconds(0); return; }
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [isConnected]);

  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

const MIN_PANEL_HEIGHT = 220;
const MAX_PANEL_HEIGHT = 800;
const DEFAULT_PANEL_HEIGHT = 280;
const COMPACT_DEFAULT_HEIGHT = 200;
const COMPACT_MIN_HEIGHT = 176;
const COMPACT_MAX_HEIGHT = 420;

export default function DMCallView({
  otherUserName,
  otherUser,
  isGroup,
  groupMembers = [],
  compact = false,
  hideResize = false,
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { settings } = useSettings();
  const {
    voiceConversationId,
    voiceConversationName,
    voiceUsers,
    speakingUsers,
    connectionState,
    dmRemoteMediaReady,
    isMuted,
    isDeafened,
    isScreenSharing,
    isCameraOn,
    ownScreenStream,
    ownCameraStream,
    remoteVideoStreams,
    toggleMute,
    toggleDeafen,
    leaveVoiceDM,
    ringAgainTrigger,
    startScreenShareDM,
    stopScreenShareDM,
    startCamera,
    stopCamera,
    switchAudioInput,
    switchAudioOutput,
    switchVideoInput,
    ringVoiceDM,
    getListenVolume01,
  } = useVoice();
  const { startRingtone, stopRingtone } = useSounds();
  const { inputs, outputs, videoInputs } = useMediaDevices();
  const [openDropdown, setOpenDropdown] = useState(null);
  const [videoLayout, setVideoLayout] = useState('grid');
  const [showParticipants, setShowParticipants] = useState(false);
  const dropdownRef = useRef(null);

  const [panelHeight, setPanelHeight] = useState(() =>
    compact ? COMPACT_DEFAULT_HEIGHT : DEFAULT_PANEL_HEIGHT
  );
  const minH = compact ? COMPACT_MIN_HEIGHT : MIN_PANEL_HEIGHT;
  const maxH = compact ? COMPACT_MAX_HEIGHT : MAX_PANEL_HEIGHT;
  const isResizing = useRef(false);
  const panelRef = useRef(null);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    const startY = e.clientY;
    const startHeight = panelRef.current?.offsetHeight || panelHeight;

    const onMouseMove = (moveEvent) => {
      if (!isResizing.current) return;
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.min(maxH, Math.max(minH, startHeight + delta));
      setPanelHeight(newHeight);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelHeight, maxH, minH]);

  useEffect(() => {
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
        setShowParticipants(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [openDropdown, showParticipants]);

  // Keyboard shortcut: M to toggle mute
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        toggleMute();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleMute]);

  const dmKey = voiceConversationId ? `dm_${voiceConversationId}` : null;
  const callUsers = dmKey ? (voiceUsers[dmKey] || []) : [];

  const currentUser = callUsers.find(u => sameUserId(u.id, user?.id));
  const otherCallUsers = callUsers.filter(u => !sameUserId(u.id, user?.id));
  const displayName = otherUserName || voiceConversationName || otherUser?.display_name || 'Someone';

  /** True if someone else was in the roster this session (covers alone-after-hangup when remote media never flipped). */
  const hadPeerInRosterRef = useRef(false);
  useEffect(() => {
    hadPeerInRosterRef.current = false;
  }, [voiceConversationId]);

  const isConnecting = connectionState === 'connecting';
  const peerJoinedRoster = otherCallUsers.length > 0;
  useEffect(() => {
    if (otherCallUsers.length > 0) hadPeerInRosterRef.current = true;
  }, [otherCallUsers.length]);

  const isWaiting =
    !isConnecting &&
    !peerJoinedRoster &&
    !dmRemoteMediaReady &&
    !hadPeerInRosterRef.current;
  const establishingVoice = !isConnecting && peerJoinedRoster && !dmRemoteMediaReady;
  const voiceLive = !isConnecting && peerJoinedRoster && dmRemoteMediaReady;
  const isAloneInCall =
    !isConnecting && !!voiceConversationId && !peerJoinedRoster && !isWaiting;

  const callTimerActive = !isConnecting && !!voiceConversationId && !isWaiting;
  const callTime = useCallTimer(callTimerActive);

  // Ringback tone while waiting for the other person to answer (outbound call)
  // Keep ringing until answered or call ends.
  useEffect(() => {
    if (!isWaiting) {
      stopRingtone();
      return;
    }
    startRingtone({ force: true });
    return () => {
      stopRingtone();
    };
  }, [isWaiting, ringAgainTrigger, startRingtone, stopRingtone]);

  // Safety: always stop ringtone when other person joins (handles race conditions / multi-tab)
  useEffect(() => {
    if (otherCallUsers.length > 0) {
      stopRingtone();
    }
  }, [otherCallUsers.length, stopRingtone]);

  const hasAnyVideo = ownCameraStream || ownScreenStream || Object.keys(remoteVideoStreams).length > 0;

  // Build video entries for grid/spotlight layout (spotlight: active speaker first)
  const videoEntries = useMemo(() => {
    const entries = [];
    const seenRemoteUids = new Set();
    Object.entries(remoteVideoStreams).forEach(([key, stream]) => {
      const uid = key.includes('\u0001') ? key.split('\u0001')[0] : key;
      if (seenRemoteUids.has(uid)) return;
      seenRemoteUids.add(uid);
      const remoteUser = callUsers.find(u => String(u.id) === uid);
      entries.push({ type: 'remote', uid, stream, label: remoteUser?.display_name || 'User', isSpeaking: speakingUsers.has(String(uid)), isSelf: false });
    });
    if (ownCameraStream) entries.push({ type: 'self', uid: 'self', stream: ownCameraStream, label: 'You', isSpeaking: user?.id != null && speakingUsers.has(String(user.id)), isSelf: true });
    if (ownScreenStream) entries.push({ type: 'screen', uid: 'screen', stream: ownScreenStream, label: 'Your screen', isSpeaking: false, isSelf: false });
    // For spotlight: put speaking user first
    entries.sort((a, b) => (b.isSpeaking ? 1 : 0) - (a.isSpeaking ? 1 : 0));
    return entries;
  }, [remoteVideoStreams, ownCameraStream, ownScreenStream, callUsers, speakingUsers, user?.id]);

  let statusIcon, statusText, statusClass;
  if (isConnecting) {
    statusClass = 'connecting';
    statusText = 'Connecting...';
    statusIcon = (
      <svg className="dm-call-status-icon spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
      </svg>
    );
  } else if (establishingVoice) {
    statusClass = 'connecting';
    statusText = 'Establishing voice connection…';
    statusIcon = (
      <svg className="dm-call-status-icon spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
      </svg>
    );
  } else if (isWaiting) {
    statusClass = 'ringing';
    statusText = isGroup ? 'Waiting for others...' : `Calling ${displayName}...`;
    statusIcon = (
      <svg className="dm-call-status-icon ring" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
      </svg>
    );
  } else if (isAloneInCall) {
    statusClass = 'connected';
    statusText = `${callTime} · ${isGroup ? t('dmCall.aloneInCallGroup') : t('dmCall.aloneInCallDm')}`;
    statusIcon = <span className="dm-call-status-dot-live" />;
  } else {
    statusClass = 'connected';
    statusText = `${callTime} · ${callUsers.length} in call · Voice connected`;
    statusIcon = <span className="dm-call-status-dot-live" />;
  }

  return (
    <div
      ref={panelRef}
      className={`dm-call-panel ${hasAnyVideo ? 'has-video' : ''} ${compact ? 'dm-call-panel--compact' : ''}`}
      style={{ height: panelHeight }}
    >
      {/* Video Grid / Spotlight */}
      {hasAnyVideo && (
        <div className={`dm-call-video-container layout-${videoLayout}`}>
          {videoLayout === 'grid' ? (
            <div className={`dm-call-video-grid grid-${Math.min(videoEntries.length, 4)}`}>
              {videoEntries.map(({ uid, stream, label, isSelf }) => {
                const volUid = !isSelf && uid !== 'screen' ? uid : null;
                return (
                  <VideoTile
                    key={uid}
                    stream={stream}
                    muted={!!isSelf}
                    label={label}
                    isSelf={!!isSelf}
                    volumeUserId={volUid}
                    listenVolume01={volUid != null ? getListenVolume01(volUid) : 1}
                  />
                );
              })}
            </div>
          ) : (
            <div className="dm-call-video-spotlight">
              {videoEntries.length > 0 && (
                <>
                  <div className="dm-call-spotlight-main">
                    <VideoTile
                      stream={videoEntries[0].stream}
                      muted={!!videoEntries[0].isSelf}
                      label={videoEntries[0].label}
                      isSelf={!!videoEntries[0].isSelf}
                      volumeUserId={!videoEntries[0].isSelf && videoEntries[0].uid !== 'screen' ? videoEntries[0].uid : null}
                      listenVolume01={
                        !videoEntries[0].isSelf && videoEntries[0].uid !== 'screen'
                          ? getListenVolume01(videoEntries[0].uid)
                          : 1
                      }
                    />
                  </div>
                  {videoEntries.length > 1 && (
                    <div className="dm-call-spotlight-strip">
                      {videoEntries.slice(1).map(({ uid, stream, label, isSelf }) => {
                        const volUid = !isSelf && uid !== 'screen' ? uid : null;
                        return (
                          <div key={uid} className="dm-call-spotlight-thumb">
                            <VideoTile
                              stream={stream}
                              muted={!!isSelf}
                              label={label}
                              isSelf={!!isSelf}
                              volumeUserId={volUid}
                              listenVolume01={volUid != null ? getListenVolume01(volUid) : 1}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {hasAnyVideo && videoEntries.length > 1 && (
            <button
              className="dm-call-layout-toggle"
              onClick={() => setVideoLayout(v => v === 'grid' ? 'spotlight' : 'grid')}
              title={videoLayout === 'grid' ? 'Switch to spotlight view' : 'Switch to grid view'}
            >
              <LayoutGrid size={18} strokeWidth={2} />
              <span>{videoLayout === 'grid' ? 'Spotlight' : 'Grid'}</span>
            </button>
          )}
        </div>
      )}

      {/* Avatars (shown when no video) */}
      {!hasAnyVideo && (
        <div className={`dm-call-avatars ${isGroup ? 'group-call' : ''}`}>
          {otherCallUsers.length > 0 ? (
            otherCallUsers.map(u => (
              <CallAvatar
                key={u.id}
                voiceUser={u}
                isSpeaking={u.id != null && speakingUsers.has(String(u.id))}
                state={voiceLive ? 'connected' : establishingVoice ? 'connecting' : 'idle'}
                size={isGroup && callUsers.length > 3 ? 'small' : 'normal'}
                isSelf={false}
              />
            ))
          ) : isAloneInCall && currentUser ? (
            <CallAvatar
              voiceUser={currentUser}
              isSpeaking={user?.id != null && speakingUsers.has(String(user.id))}
              state="connected"
              size={isGroup && callUsers.length > 3 ? 'small' : 'normal'}
              isSelf
            />
          ) : isGroup && groupMembers.length > 0 ? (
            /* Group call ringing: show all group members' avatars */
            groupMembers.filter(m => m.id !== user?.id).map(m => (
              <CallAvatar
                key={m.id}
                voiceUser={{
                  id: m.id,
                  display_name: m.display_name,
                  avatar_url: m.avatar_url ?? null,
                }}
                isSpeaking={false}
                state={isConnecting ? 'connecting' : 'ringing'}
                size={groupMembers.length > 4 ? 'small' : 'normal'}
                isSelf={false}
              />
            ))
          ) : (
            <CallAvatar
              voiceUser={{
                id: 'placeholder',
                display_name: displayName,
                avatar_url: otherUser?.avatar_url ?? null,
              }}
              isSpeaking={false}
              state={isConnecting ? 'connecting' : 'ringing'}
            />
          )}
          {currentUser && !isAloneInCall && (
            <CallAvatar
              voiceUser={currentUser}
              isSpeaking={user?.id != null && speakingUsers.has(String(user.id))}
              state={voiceLive ? 'connected' : (isConnecting || establishingVoice) ? 'connecting' : 'idle'}
              size={isGroup && callUsers.length > 3 ? 'small' : 'normal'}
              isSelf
            />
          )}
        </div>
      )}

      <div className={`dm-call-status ${statusClass}`}>
        {statusIcon}
        <span className="dm-call-status-text">{statusText}</span>
      </div>

      {isWaiting && (
        <button className="dm-call-ring-again" onClick={ringVoiceDM} title="Ring again">
          <Phone size={14} strokeWidth={2.5} />
          <span>Ring Again</span>
        </button>
      )}

      <div className="dm-call-controls" ref={dropdownRef}>
        <div className="dm-call-ctrl-group-wrap">
          <div className={`dm-call-ctrl-split ${isMuted ? 'has-active danger' : ''}`}>
            <button className="dm-call-ctrl-main" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <MicOff size={20} strokeWidth={2} /> : <Mic size={20} strokeWidth={2} />}
            </button>
            <span className="dm-call-ctrl-divider" />
            <button className="dm-call-ctrl-dropdown" onClick={() => setOpenDropdown(openDropdown === 'mic' ? null : 'mic')} title="Select microphone" data-open={openDropdown === 'mic'} aria-expanded={openDropdown === 'mic'}>
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          </div>
          {openDropdown === 'mic' && (
            <div className="dm-call-device-popover">
              {inputs.map((d) => (
                <button key={d.value} onClick={() => { switchAudioInput(d.value); setOpenDropdown(null); }} data-selected={settings?.input_device === d.value} title={d.label}>
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dm-call-ctrl-group-wrap">
          <div className={`dm-call-ctrl-split ${isCameraOn ? 'has-active camera-on' : ''}`}>
            <button className="dm-call-ctrl-main" onClick={() => isCameraOn ? stopCamera() : startCamera()} title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}>
              {isCameraOn ? <Video size={20} strokeWidth={2} /> : <VideoOff size={20} strokeWidth={2} />}
            </button>
            <span className="dm-call-ctrl-divider" />
            <button className="dm-call-ctrl-dropdown" onClick={() => setOpenDropdown(openDropdown === 'camera' ? null : 'camera')} title="Select camera" data-open={openDropdown === 'camera'} aria-expanded={openDropdown === 'camera'}>
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          </div>
          {openDropdown === 'camera' && (
            <div className="dm-call-device-popover">
              {videoInputs.map((d) => (
                <button key={d.value} onClick={() => { switchVideoInput(d.value); setOpenDropdown(null); }} data-selected={settings?.video_device === d.value} title={d.label}>
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dm-call-screen-share-group">
          <button className={`dm-call-ctrl ${isScreenSharing ? 'active screen-on' : ''}`} onClick={() => (isScreenSharing ? stopScreenShareDM() : startScreenShareDM())} title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
            <Monitor size={20} strokeWidth={2} />
          </button>
          <ScreenShareVolumeControl variant="dm" />
        </div>

        {callUsers.length > 1 && (
          <div className="dm-call-ctrl-group dm-call-ctrl-group-wrap">
            <button className={`dm-call-ctrl ${showParticipants ? 'active' : ''}`} onClick={() => setShowParticipants(s => !s)} title="Participants">
              <UserCircle2 size={20} strokeWidth={2} />
            </button>
            {showParticipants && (
              <div className="dm-call-device-popover dm-call-participants-popover">
                <div className="dm-call-participants-header">Participants</div>
                {callUsers.map((u) => (
                  <div key={u.id} className="dm-call-participant-row">
                    <span className="dm-call-participant-dot" data-speaking={u.id != null && speakingUsers.has(String(u.id))} />
                    <span>{u.id === user?.id ? 'You' : (u.display_name || 'User')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="dm-call-ctrl-group-wrap">
          <div className={`dm-call-ctrl-split ${isDeafened ? 'has-active danger' : ''}`}>
            <button className="dm-call-ctrl-main" onClick={toggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
              {isDeafened ? <HeadphoneOff size={20} strokeWidth={2} /> : <Headphones size={20} strokeWidth={2} />}
            </button>
            <span className="dm-call-ctrl-divider" />
            <button className="dm-call-ctrl-dropdown" onClick={() => setOpenDropdown(openDropdown === 'output' ? null : 'output')} title="Select audio output" data-open={openDropdown === 'output'} aria-expanded={openDropdown === 'output'}>
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          </div>
          {openDropdown === 'output' && (
            <div className="dm-call-device-popover">
              {outputs.map((d) => (
                <button key={d.value} onClick={() => { switchAudioOutput(d.value); setOpenDropdown(null); }} data-selected={settings?.output_device === d.value} title={d.label}>
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="dm-call-ctrl leave" onClick={leaveVoiceDM} title="Leave Call">
          <PhoneOff size={20} strokeWidth={2.5} />
        </button>
      </div>

      {!hideResize && (
        <div className="dm-call-resize-handle" onMouseDown={handleResizeStart}>
          <span className="dm-call-resize-grip" />
        </div>
      )}
    </div>
  );
}
