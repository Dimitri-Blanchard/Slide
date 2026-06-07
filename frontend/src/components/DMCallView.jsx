import React, { memo, useState, useEffect, useRef, useMemo } from 'react';
import { AvatarImg } from './Avatar';
import AppIcon from './icons/AppIcon';
import { useVoice, sameUserId } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useSounds } from '../context/SoundContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useTranslation } from '../context/LanguageContext';
import { RemoteStreamVolumeControl } from './RemoteStreamVolumeControl';
import './DMCallView.css';

const VideoTile = memo(function VideoTile({ stream, muted = true, isSelf, volumeUserId, listenVolume01 = 1, pip }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  useEffect(() => {
    if (!ref.current || muted) return;
    ref.current.volume = Math.min(1, Math.max(0, listenVolume01));
  }, [listenVolume01, muted]);
  if (!stream) return null;
  return (
    <div className={`dm-call-video ${pip ? 'is-pip' : ''} ${isSelf ? 'is-self' : ''}`}>
      <video ref={ref} autoPlay playsInline muted={muted} style={{ transform: isSelf ? 'scaleX(-1)' : 'none' }} />
      {volumeUserId != null && !isSelf && (
        <div className="dm-call-video-vol" onClick={(e) => e.stopPropagation()}>
          <RemoteStreamVolumeControl userId={volumeUserId} variant="dm" />
        </div>
      )}
    </div>
  );
});

function useCallTimer(active) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) { setS(0); return; }
    const id = setInterval(() => setS((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function Btn({ on, danger, end, onClick, title, children }) {
  return (
    <button
      type="button"
      className={`dm-call-btn${on ? (danger ? ' is-off' : ' is-on') : ''}${end ? ' dm-call-btn--end' : ''}`}
      onClick={onClick}
      title={title}
      data-voice-mute-trigger={title === 'Mute' || title === 'Unmute' ? true : undefined}
    >
      {children}
    </button>
  );
}

export default function DMCallView({
  otherUserName,
  otherUser,
  isGroup,
  groupMembers = [],
  compact = false,
  embedded = false,
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { settings } = useSettings();
  const {
    voiceConversationId, voiceConversationName, voiceLeaveAnim, voiceUsers, speakingUsers,
    connectionState, dmRemoteMediaReady, isMuted, isDeafened, isScreenSharing, isCameraOn,
    ownScreenStream, ownCameraStream, remoteVideoStreams, toggleMute, toggleDeafen, leaveVoiceDM,
    ringAgainTrigger, startScreenShareDM, stopScreenShareDM, startCamera, stopCamera,
    switchAudioInput, switchAudioOutput, switchVideoInput, ringVoiceDM, getListenVolume01,
    setVoiceMiniIslandPreview,
  } = useVoice();
  const { startRingtone, stopRingtone } = useSounds();
  const { inputs, outputs, videoInputs } = useMediaDevices();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey
        && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) toggleMute();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleMute]);

  const dmKey = voiceConversationId ? `dm_${voiceConversationId}` : null;
  const callUsers = dmKey ? (voiceUsers[dmKey] || []) : [];
  const others = callUsers.filter((u) => !sameUserId(u.id, user?.id));
  const displayName = otherUserName || voiceConversationName || otherUser?.display_name || 'Someone';

  const hadPeer = useRef(false);
  useEffect(() => { hadPeer.current = false; }, [voiceConversationId]);
  useEffect(() => { if (others.length > 0) hadPeer.current = true; }, [others.length]);

  const leaving = connectionState === 'leaving';
  const exiting = leaving || (voiceLeaveAnim?.kind === 'dm'
    && voiceConversationId != null && Number(voiceLeaveAnim.conversationId) === Number(voiceConversationId));
  const connecting = connectionState === 'connecting' && !leaving;
  const waiting = !connecting && others.length === 0 && !dmRemoteMediaReady && !hadPeer.current;
  const establishing = !connecting && others.length > 0 && !dmRemoteMediaReady;
  const live = !connecting && others.length > 0 && dmRemoteMediaReady;
  const alone = !connecting && !!voiceConversationId && others.length === 0 && !waiting;
  const timer = useCallTimer(!connecting && !!voiceConversationId && !waiting);

  useEffect(() => {
    if (!waiting) { stopRingtone(); return; }
    startRingtone({ force: true });
    return stopRingtone;
  }, [waiting, ringAgainTrigger, startRingtone, stopRingtone]);
  useEffect(() => { if (others.length > 0) stopRingtone(); }, [others.length, stopRingtone]);

  const hasVideo = !!(ownCameraStream || ownScreenStream || Object.keys(remoteVideoStreams).length);

  const videos = useMemo(() => {
    const list = [];
    const seen = new Set();
    Object.entries(remoteVideoStreams).forEach(([key, stream]) => {
      const uid = key.includes('\u0001') ? key.split('\u0001')[0] : key;
      if (seen.has(uid)) return;
      seen.add(uid);
      list.push({ uid, stream, isSelf: false });
    });
    if (ownCameraStream) list.push({ uid: 'self', stream: ownCameraStream, isSelf: true });
    if (ownScreenStream) list.push({ uid: 'screen', stream: ownScreenStream, isSelf: false });
    return list;
  }, [remoteVideoStreams, ownCameraStream, ownScreenStream]);

  useEffect(() => {
    if (compact || !voiceConversationId) return;
    const v = videos[0];
    if (v?.stream) {
      const remote = !v.isSelf && v.uid !== 'screen' ? callUsers.find((u) => String(u.id) === v.uid) : null;
      setVoiceMiniIslandPreview({
        userId: v.uid,
        displayName: remote?.display_name || displayName,
        avatarUrl: remote?.avatar_url ?? (v.isSelf ? user?.avatar_url : otherUser?.avatar_url) ?? null,
        bannerColor: remote?.banner_color ?? null,
        bannerColor2: remote?.banner_color_2 ?? null,
        isLive: true,
        isSelf: !!v.isSelf,
        isSpeaking: speakingUsers.has(String(v.uid)),
      });
      return;
    }
    if (otherUser && !isGroup) {
      setVoiceMiniIslandPreview({
        userId: otherUser.id,
        displayName: otherUser.display_name || displayName,
        avatarUrl: otherUser.avatar_url ?? null,
        bannerColor: otherUser.banner_color ?? null,
        bannerColor2: otherUser.banner_color_2 ?? null,
        isLive: false,
        isSelf: false,
        isSpeaking: speakingUsers.has(String(otherUser.id)),
      });
    }
  }, [compact, voiceConversationId, videos, otherUser, isGroup, displayName, callUsers, user, speakingUsers, setVoiceMiniIslandPreview]);

  const primary = others[0] || otherUser || { display_name: displayName, avatar_url: otherUser?.avatar_url };
  const speaking = primary?.id != null && speakingUsers.has(String(primary.id));

  let status;
  if (leaving) status = t('dmCall.leaving', 'Leaving…');
  else if (connecting) status = t('dmCall.connecting', 'Connecting…');
  else if (establishing) status = t('dmCall.establishingVoice', 'Connecting audio…');
  else if (waiting) {
    status = isGroup
      ? t('dmCall.waitingGroup', 'Waiting…')
      : t('dmCall.callingUser', { name: displayName, defaultValue: `Calling ${displayName}…` });
  } else if (alone) status = t('dmCall.aloneInCallDm', 'In call alone');
  else if (callUsers.length > 1) status = `${timer} · ${callUsers.length}`;
  else status = timer;

  const mainVideo = videos.find((v) => !v.isSelf) || videos[0];
  const pipVideo = videos.find((v) => v.isSelf && v !== mainVideo);

  const iconSize = 20;

  const meta = (
    <div className="dm-call-meta">
      {!embedded && <span className="dm-call-name">{displayName}</span>}
      <span className={`dm-call-label${live || alone ? ' live' : ''}`}>{status}</span>
    </div>
  );

  const avatar = (
    <div className={`dm-call-avatar${speaking ? ' speaking' : ''}`}>
      {primary?.avatar_url ? (
        <AvatarImg src={primary.avatar_url} alt={displayName} />
      ) : (
        <span>{(displayName || '?').charAt(0).toUpperCase()}</span>
      )}
    </div>
  );

  const actions = (
    <div className="dm-call-actions" ref={menuRef}>
      <Btn on={isMuted} danger onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
        <AppIcon name={isMuted ? 'micOff' : 'mic'} size={iconSize} />
      </Btn>
      <Btn on={isCameraOn} onClick={() => (isCameraOn ? stopCamera() : startCamera())} title="Camera">
        <AppIcon name={isCameraOn ? 'camera' : 'cameraOff'} size={iconSize} />
      </Btn>
      <Btn on={isScreenSharing} onClick={() => (isScreenSharing ? stopScreenShareDM() : startScreenShareDM())} title="Screen">
        <AppIcon name="screenShare" size={iconSize} />
      </Btn>
      <Btn on={isDeafened} danger onClick={toggleDeafen} title="Deafen">
        <AppIcon name={isDeafened ? 'deafenOff' : 'deafen'} size={iconSize} />
      </Btn>
      <div className="dm-call-menu-wrap">
        <Btn on={menuOpen} onClick={() => setMenuOpen((o) => !o)} title="More">
          <AppIcon name="more" size={iconSize} />
        </Btn>
        {menuOpen && (
          <div className="dm-call-menu">
            {waiting && (
              <button type="button" onClick={() => { ringVoiceDM(); setMenuOpen(false); }}>
                {t('dmCall.ringAgain', 'Ring again')}
              </button>
            )}
            {inputs.map((d) => (
              <button key={d.value} type="button" data-selected={settings?.input_device === d.value}
                onClick={() => { switchAudioInput(d.value); setMenuOpen(false); }}>{d.label}</button>
            ))}
            {videoInputs.map((d) => (
              <button key={`v-${d.value}`} type="button" data-selected={settings?.video_device === d.value}
                onClick={() => { switchVideoInput(d.value); setMenuOpen(false); }}>{d.label}</button>
            ))}
            {outputs.map((d) => (
              <button key={`o-${d.value}`} type="button" data-selected={settings?.output_device === d.value}
                onClick={() => { switchAudioOutput(d.value); setMenuOpen(false); }}>{d.label}</button>
            ))}
          </div>
        )}
      </div>
      <Btn end onClick={leaveVoiceDM} title={t('dmCall.leaveCall', 'Leave')}>
        <AppIcon name="phoneOff" size={iconSize} />
      </Btn>
    </div>
  );

  return (
    <div
      className={[
        'dm-call',
        hasVideo && 'has-video',
        embedded && 'dm-call--embedded',
        compact && 'dm-call--compact',
        exiting && 'dm-call--exiting',
      ].filter(Boolean).join(' ')}
    >
      {hasVideo && (
        <div className="dm-call-video-box">
          {mainVideo && (
            <VideoTile
              stream={mainVideo.stream}
              muted={!!mainVideo.isSelf}
              isSelf={!!mainVideo.isSelf}
              volumeUserId={!mainVideo.isSelf && mainVideo.uid !== 'screen' ? mainVideo.uid : null}
              listenVolume01={!mainVideo.isSelf && mainVideo.uid !== 'screen' ? getListenVolume01(mainVideo.uid) : 1}
            />
          )}
          {pipVideo && <VideoTile pip stream={pipVideo.stream} muted isSelf />}
        </div>
      )}

      <div className="dm-call-bar">
        {!hasVideo && (
          <div className="dm-call-main">
            {avatar}
            {meta}
          </div>
        )}
        {hasVideo && meta}
        {actions}
      </div>
    </div>
  );
}
