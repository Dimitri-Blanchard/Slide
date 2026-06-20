import React, { memo, useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { AvatarImg } from './Avatar';
import AppIcon from './icons/AppIcon';
import { useVoice, sameUserId } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useSounds } from '../context/SoundContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useDmCallStageHeight } from '../hooks/useDmCallStageHeight';
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

function DockBtn({ on, danger, onClick, title, children }) {
  return (
    <button
      type="button"
      className={`dm-call-dock-btn${on ? (danger ? ' is-off' : ' is-on') : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      data-voice-mute-trigger={title === 'Mute' || title === 'Unmute' ? true : undefined}
    >
      {children}
    </button>
  );
}

function SplitDockControl({ active, danger, open, onMain, onChevron, chevronTitle, title, children }) {
  return (
    <div className={`dm-call-split${active ? (danger ? ' is-off' : ' is-on') : ''}${open ? ' is-open' : ''}`}>
      <button type="button" className="dm-call-dock-btn dm-call-split-main" onClick={onMain} title={title} aria-label={title}>
        {children}
      </button>
      <button
        type="button"
        className="dm-call-split-chevron"
        onClick={onChevron}
        title={chevronTitle}
        aria-label={chevronTitle}
        aria-expanded={open}
      >
        <AppIcon name="caretUp" size={10} weight="bold" />
      </button>
    </div>
  );
}

function DevicePopover({ rect, title, items, selected, onPick, onClose }) {
  if (!rect) return null;
  return createPortal(
    <div
      className="dm-call-device-popover"
      style={{ left: rect.left, bottom: rect.bottom, transform: 'translateX(-50%)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="dm-call-device-popover-title">{title}</div>
      {items.map((d) => (
        <button
          key={d.value}
          type="button"
          data-selected={selected === d.value}
          title={d.label}
          onClick={() => { onPick(d.value); onClose(); }}
        >
          {d.label}
        </button>
      ))}
    </div>,
    document.body
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
  const resizable = embedded || compact;
  const stageRef = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openPopover, setOpenPopover] = useState(null);
  const [popoverRect, setPopoverRect] = useState(null);
  const dockRef = useRef(null);
  const micRef = useRef(null);
  const camRef = useRef(null);
  const deafenRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (dockRef.current?.contains(e.target)) return;
      if (e.target.closest('.dm-call-device-popover')) return;
      setMoreOpen(false);
      setOpenPopover(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useLayoutEffect(() => {
    if (!openPopover) { setPopoverRect(null); return; }
    const map = { mic: micRef, camera: camRef, deafen: deafenRef };
    const el = map[openPopover]?.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPopoverRect({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 8 });
  }, [openPopover]);

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

  let statusPhase = 'live';
  let statusHeadline;
  let statusSub = null;
  if (leaving) {
    statusPhase = 'leaving';
    statusHeadline = t('dmCall.leaving', 'Leaving…');
  } else if (connecting || establishing) {
    statusPhase = 'connecting';
    statusHeadline = establishing
      ? t('dmCall.establishingVoice', 'Connecting audio…')
      : t('dmCall.connecting', 'Connecting…');
  } else if (waiting) {
    statusPhase = 'waiting';
    statusHeadline = isGroup
      ? t('dmCall.waitingGroup', 'Waiting…')
      : t('dmCall.callingUser', { name: displayName, defaultValue: `Calling ${displayName}…` });
    statusSub = t('dmCall.ringingHint', 'Waiting for an answer');
  } else if (alone) {
    statusPhase = 'alone';
    statusHeadline = t('dmCall.aloneInCallDm', 'In call alone');
  } else if (live) {
    statusPhase = 'live';
    statusHeadline = t('dmCall.voiceConnected', 'Voice Connected');
    statusSub = callUsers.length > 1
      ? `${timer} · ${t('dmCall.inCallMeta', { count: callUsers.length, defaultValue: `${callUsers.length} in call` })}`
      : timer;
  } else {
    statusPhase = 'live';
    statusHeadline = t('dmCall.voiceConnected', 'Voice Connected');
    statusSub = timer;
  }

  const mainVideo = videos.find((v) => !v.isSelf) || videos[0];
  const pipVideo = videos.find((v) => v.isSelf && v !== mainVideo);
  const iconSize = 20;
  const stageName = compact ? null : displayName;

  const { stageHeight, contentMinHeight, handleResizeStart } = useDmCallStageHeight(
    resizable,
    stageRef,
    [hasVideo, compact, embedded, stageName, statusHeadline, statusSub],
  );

  const togglePopover = (key) => {
    setMoreOpen(false);
    setOpenPopover((prev) => (prev === key ? null : key));
  };

  const dock = (
    <div className="dm-call-dock" ref={dockRef}>
      <div className="dm-call-dock-pill">
        <div className="dm-call-dock-group" ref={micRef}>
          <SplitDockControl
            active={isMuted}
            danger
            open={openPopover === 'mic'}
            title={isMuted ? 'Unmute' : 'Mute'}
            chevronTitle={t('dmCall.mic', 'Microphone')}
            onMain={toggleMute}
            onChevron={(e) => { e.stopPropagation(); togglePopover('mic'); }}
          >
            <AppIcon name={isMuted ? 'micOff' : 'mic'} size={iconSize} />
          </SplitDockControl>
        </div>

        <div className="dm-call-dock-group" ref={camRef}>
          <SplitDockControl
            active={isCameraOn}
            open={openPopover === 'camera'}
            title={t('dmCall.camera', 'Camera')}
            chevronTitle={t('dmCall.camera', 'Camera')}
            onMain={() => (isCameraOn ? stopCamera() : startCamera())}
            onChevron={(e) => { e.stopPropagation(); togglePopover('camera'); }}
          >
            <AppIcon name={isCameraOn ? 'camera' : 'cameraOff'} size={iconSize} />
          </SplitDockControl>
        </div>

        <div className="dm-call-dock-group">
          <DockBtn
            on={isScreenSharing}
            onClick={() => (isScreenSharing ? stopScreenShareDM() : startScreenShareDM())}
            title="Screen"
          >
            <AppIcon name="screenShare" size={iconSize} />
          </DockBtn>
          <div ref={deafenRef}>
            <SplitDockControl
              active={isDeafened}
              danger
              open={openPopover === 'deafen'}
              title="Deafen"
              chevronTitle={t('dmCall.speaker', 'Speaker')}
              onMain={toggleDeafen}
              onChevron={(e) => { e.stopPropagation(); togglePopover('deafen'); }}
            >
              <AppIcon name={isDeafened ? 'deafenOff' : 'deafen'} size={iconSize} />
            </SplitDockControl>
          </div>
        </div>

        <div className="dm-call-dock-group" ref={moreRef}>
          <DockBtn on={moreOpen} onClick={(e) => { e.stopPropagation(); setOpenPopover(null); setMoreOpen((o) => !o); }} title="More">
            <AppIcon name="more" size={iconSize} />
          </DockBtn>
          {moreOpen && (
            <div className="dm-call-menu">
              {waiting && (
                <button type="button" onClick={() => { ringVoiceDM(); setMoreOpen(false); }}>
                  {t('dmCall.ringAgain', 'Ring again')}
                </button>
              )}
              {inputs.map((d) => (
                <button key={d.value} type="button" data-selected={settings?.input_device === d.value}
                  onClick={() => { switchAudioInput(d.value); setMoreOpen(false); }}>{d.label}</button>
              ))}
              {videoInputs.map((d) => (
                <button key={`v-${d.value}`} type="button" data-selected={settings?.video_device === d.value}
                  onClick={() => { switchVideoInput(d.value); setMoreOpen(false); }}>{d.label}</button>
              ))}
              {outputs.map((d) => (
                <button key={`o-${d.value}`} type="button" data-selected={settings?.output_device === d.value}
                  onClick={() => { switchAudioOutput(d.value); setMoreOpen(false); }}>{d.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className="dm-call-dock-leave"
        onClick={leaveVoiceDM}
        title={t('dmCall.leaveCall', 'Leave')}
        aria-label={t('dmCall.leaveCall', 'Leave')}
      >
        <AppIcon name="phoneOff" size={iconSize} />
      </button>
    </div>
  );

  const rootStyle = resizable && stageHeight != null
    ? {
        '--dm-call-stage-h': `${stageHeight}px`,
        '--dm-call-stage-min-h': `${contentMinHeight}px`,
      }
    : undefined;

  return (
    <div
      className={[
        'dm-call',
        hasVideo && 'has-video',
        embedded && 'dm-call--embedded',
        compact && 'dm-call--compact',
        resizable && 'dm-call--resizable',
        exiting && 'dm-call--exiting',
      ].filter(Boolean).join(' ')}
      style={rootStyle}
    >
      <div className="dm-call-stage" ref={stageRef}>
        {hasVideo ? (
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
        ) : (
          <div className="dm-call-stage-idle">
            <div className={`dm-call-avatar-wrap${waiting ? ' ringing' : ''}`}>
              <div className={`dm-call-avatar${speaking ? ' speaking' : ''}`}>
                {primary?.avatar_url ? (
                  <AvatarImg src={primary.avatar_url} alt={displayName} />
                ) : (
                  <span>{(displayName || '?').charAt(0).toUpperCase()}</span>
                )}
              </div>
            </div>
            {stageName && <div className="dm-call-stage-name">{stageName}</div>}
            <div className={`dm-call-stage-status dm-call-stage-status--${statusPhase}`}>
              <span className="dm-call-stage-status-head">{statusHeadline}</span>
              {statusSub && <span className="dm-call-stage-status-sub">{statusSub}</span>}
            </div>
          </div>
        )}

        {hasVideo && (
          <div className="dm-call-stage-video-meta">
            <div className={`dm-call-stage-status dm-call-stage-status--${statusPhase}`}>
              <span className="dm-call-stage-status-head">{statusHeadline}</span>
              {statusSub && <span className="dm-call-stage-status-sub">{statusSub}</span>}
            </div>
          </div>
        )}

        <div className="dm-call-dock-wrap">{dock}</div>
      </div>

      {resizable && (
        <div
          className="dm-call-resize-edge"
          onPointerDown={handleResizeStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('dmCall.resizeStage', 'Resize call panel')}
          aria-hidden="true"
        />
      )}

      {openPopover === 'mic' && (
        <DevicePopover
          rect={popoverRect}
          title={t('dmCall.mic', 'Microphone')}
          items={inputs}
          selected={settings?.input_device}
          onPick={switchAudioInput}
          onClose={() => setOpenPopover(null)}
        />
      )}
      {openPopover === 'camera' && (
        <DevicePopover
          rect={popoverRect}
          title={t('dmCall.camera', 'Camera')}
          items={videoInputs}
          selected={settings?.video_device}
          onPick={switchVideoInput}
          onClose={() => setOpenPopover(null)}
        />
      )}
      {openPopover === 'deafen' && (
        <DevicePopover
          rect={popoverRect}
          title={t('dmCall.speaker', 'Speaker')}
          items={outputs}
          selected={settings?.output_device}
          onPick={switchAudioOutput}
          onClose={() => setOpenPopover(null)}
        />
      )}
    </div>
  );
}
