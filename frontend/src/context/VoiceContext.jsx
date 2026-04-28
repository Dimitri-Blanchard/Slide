import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { useNotification } from './NotificationContext';

const VoiceContext = createContext(null);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
  sdpSemantics: 'unified-plan',
};

const AUDIO_BITRATE = 128000;
const VIDEO_BITRATE_NITRO = 12_000_000;
const VIDEO_BITRATE_FREE = 2_500_000;
const NITRO_STREAM_SEEN_KEY = 'slide_nitro_stream_celebrated';

function applyScreenShareTrackHints(stream) {
  const track = stream?.getVideoTracks?.()?.[0];
  if (!track) return;
  try {
    track.contentHint = 'detail';
  } catch (_) {}
}

function setOpusAttributes(sdp) {
  const opusPayload = sdp.match(/a=rtpmap:(\d+) opus\/48000/);
  if (!opusPayload) return sdp;
  const pt = opusPayload[1];
  const fmtpLine = `a=fmtp:${pt}`;
  const params = `minptime=10;useinbandfec=1;maxaveragebitrate=${AUDIO_BITRATE};stereo=0;sprop-stereo=0;cbr=0;maxplaybackrate=48000`;
  if (sdp.includes(fmtpLine)) {
    return sdp.replace(new RegExp(`${fmtpLine} [^\\r\\n]+`), `${fmtpLine} ${params}`);
  }
  return sdp.replace(`a=rtpmap:${pt} opus/48000/2`, `a=rtpmap:${pt} opus/48000/2\r\n${fmtpLine} ${params}`);
}

async function configureAudioSender(pc) {
  const audioSenders = pc.getSenders().filter(s => s.track?.kind === 'audio');
  for (const sender of audioSenders) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = AUDIO_BITRATE;
      if ('priority' in params.encodings[0] || params.encodings[0].priority === undefined) {
        params.encodings[0].priority = 'high';
      }
      if ('networkPriority' in params.encodings[0] || params.encodings[0].networkPriority === undefined) {
        params.encodings[0].networkPriority = 'high';
      }
      await sender.setParameters(params);
    } catch (e) {
      console.warn('configureAudioSender:', e.message);
    }
  }
}

async function configureVideoSender(pc, hasNitro) {
  try {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    const enc = params.encodings[0];
    enc.maxBitrate = hasNitro ? VIDEO_BITRATE_NITRO : VIDEO_BITRATE_FREE;
    enc.maxFramerate = hasNitro ? 60 : 30;
    enc.scaleResolutionDownBy = 1;
    enc.priority = 'high';
    enc.networkPriority = 'high';
    await sender.setParameters(params);
  } catch (e) {
    console.warn('configureVideoSender:', e.message);
  }
}

function reconfigureAllVideoSenders(peerConnectionsRef, hasNitro) {
  Object.values(peerConnectionsRef.current || {}).forEach((pc) => {
    if (pc?.connectionState === 'connected') {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) configureVideoSender(pc, hasNitro);
    }
  });
}

const SPEAKING_THRESHOLD = 25;
const SPEAKING_CHECK_INTERVAL = 100;

function waitForSocketConnected(socket, timeoutMs = 5000) {
  if (!socket) return Promise.reject(new Error('No socket'));
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      reject(new Error('Socket connect timeout'));
    }, timeoutMs);
    const onConnect = () => { clearTimeout(timer); resolve(); };
    socket.once('connect', onConnect);
    if (socket.disconnected) socket.connect();
  });
}

export function sameUserId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Speaking Set keys are always strings so .has() works whether ids are numbers or strings. */
function speakingKey(id) {
  if (id == null || id === '') return null;
  return String(id);
}

/** Server voice handlers require positive integers; normalize strings/NaN from API or routes. */
export function coercePositiveInt(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

const VOICE_CLIENT_STORAGE_KEY = 'slide_voice_client_id';
const PEER_KEY_SEP = '\u0001';

/** WebRTC peer map key: one RTCPeerConnection per remote user + voice client id. */
export function peerKey(userId, voiceClientId) {
  if (voiceClientId == null || voiceClientId === '') return String(userId);
  return `${String(userId)}${PEER_KEY_SEP}${voiceClientId}`;
}

export function parsePeerKey(key) {
  if (typeof key !== 'string') return { userId: key, voiceClientId: null };
  const i = key.indexOf(PEER_KEY_SEP);
  if (i === -1) return { userId: key, voiceClientId: null };
  return { userId: key.slice(0, i), voiceClientId: key.slice(i + PEER_KEY_SEP.length) };
}

/** WebRTC glare: when both peers send an offer, the side with the lower user id rolls back and answers the other. */
function isPoliteGlarePeer(myUserId, remoteUserId) {
  const a = myUserId == null ? '' : String(myUserId);
  const b = remoteUserId == null ? '' : String(remoteUserId);
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) {
    return na < nb;
  }
  return a < b;
}

/** UI still keys video by logical user id; mesh may use peerKey in state. */
export function getRemoteStreamForUser(remoteVideoStreams, userId) {
  if (!remoteVideoStreams || userId == null) return null;
  const uid = String(userId);
  if (remoteVideoStreams[uid]) return remoteVideoStreams[uid];
  for (const [k, stream] of Object.entries(remoteVideoStreams)) {
    if (k.startsWith(uid + PEER_KEY_SEP)) return stream;
  }
  return null;
}

/** New id per browser tab session — avoids reusing a stale id after reload while the server dropped the old socket. */
function createVoiceClientId() {
  return crypto.randomUUID();
}

/** Dedupe server endpoint rows for sidebar (one row per user). */
function dedupeVoiceParticipantsByUserId(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (!r || r.id == null) continue;
    const id = r.id;
    if (!m.has(id)) {
      const { voice_client_id: _v, ...rest } = r;
      m.set(id, { ...rest, id });
    }
  }
  return [...m.values()];
}

/** Remove corrupt rows (missing id), self, and duplicate-by-id ghosts when leaving or swapping channels. */
function filterOutSelfInVoiceList(list, authUserId) {
  if (!Array.isArray(list)) return [];
  return list.filter((u) => {
    if (!u || u.id == null || u.id === '') return false;
    if (authUserId != null && sameUserId(u.id, authUserId)) return false;
    return true;
  });
}

/** Merge auth profile into the participant row for the current user (fixes blank name / missing avatar). */
function patchVoiceParticipantListForAuth(list, auth, mutedRef, deafenedRef) {
  if (!auth?.id || !Array.isArray(list)) return list;
  const filtered = list.filter((u) => u && u.id != null && u.id !== '');
  let foundSelf = false;
  const mapped = filtered.map((u) => {
    if (sameUserId(u.id, auth.id)) {
      foundSelf = true;
      return {
        ...u,
        id: auth.id,
        display_name: auth.display_name ?? u.display_name ?? 'User',
        avatar_url: auth.avatar_url ?? u.avatar_url ?? null,
      };
    }
    return u;
  });
  if (foundSelf) return mapped;
  return [
    ...mapped,
    {
      id: auth.id,
      display_name: auth.display_name ?? 'User',
      avatar_url: auth.avatar_url ?? null,
      muted: mutedRef.current,
      deafened: deafenedRef.current,
    },
  ];
}

export function VoiceProvider({ children }) {
  const socket = useSocket();
  const { user } = useAuth();
  const { settings, updateSetting } = useSettings();
  const { notify } = useNotification();
  const hasNitroRef = useRef(!!user?.has_nitro);
  useEffect(() => {
    hasNitroRef.current = !!user?.has_nitro;
  }, [user?.has_nitro]);

  const [voiceChannelId, setVoiceChannelId] = useState(null);
  const [voiceTeamId, setVoiceTeamId] = useState(null);
  const [voiceChannelName, setVoiceChannelName] = useState('');
  const [voiceConversationId, setVoiceConversationId] = useState(null);
  const [voiceConversationName, setVoiceConversationName] = useState('');
  const [incomingCall, setIncomingCall] = useState(null); // { conversationId, caller: { id, display_name, avatar_url } }
  const [voiceUsers, setVoiceUsers] = useState({});
  const [voiceChannelMeta, setVoiceChannelMeta] = useState({}); // channelId -> { channelName, teamName, teamId }
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [connectionState, setConnectionState] = useState('disconnected');
  /** DM: WebRTC reports connected or remote audio is playing (roster alone can lag behind media). */
  const [dmRemoteMediaReady, setDmRemoteMediaReady] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [ownScreenStream, setOwnScreenStream] = useState(null);
  const [ownCameraStream, setOwnCameraStream] = useState(null);
  const [screenSharingUserIds, setScreenSharingUserIds] = useState(new Set());
  const [videoEnabledUserIds, setVideoEnabledUserIds] = useState(new Set());
  const [remoteVideoStreams, setRemoteVideoStreams] = useState({});
  const [expandedLiveView, setExpandedLiveView] = useState(null);
  const [voiceViewMinimized, setVoiceViewMinimized] = useState(false);
  /** Desktop floating DM call panel: user hid the expanded card (call stays active). */
  const [dmFloatingPanelCollapsed, setDmFloatingPanelCollapsed] = useState(false);
  /** DM call initiator (server); floating panel only for this user. */
  const [dmCallCallerId, setDmCallCallerId] = useState(null);
  const [ringAgainTrigger, setRingAgainTrigger] = useState(0);
  const [screenSharePicker, setScreenSharePicker] = useState({ visible: false, sources: [] });
  const screenShareResolveRef = useRef(null);
  const [nitroCelebration, setNitroCelebration] = useState(false);
  /** True when screen-share includes processed system/tab audio (gain slider applies). */
  const [screenShareCaptureAudioActive, setScreenShareCaptureAudioActive] = useState(false);
  /** Per remote user id: 0–100; combined with settings.output_volume for playback. */
  const [streamVolumeByUserId, setStreamVolumeByUserId] = useState({});

  /** Persisted: conversation ids the user declined ringing for (no repeat incoming until call ends or they join). */
  const declinedDmConvIdsRef = useRef(null);
  const getDeclinedDmConvIds = useCallback(() => {
    if (declinedDmConvIdsRef.current == null) {
      try {
        const raw = sessionStorage.getItem('slide_dm_voice_declined');
        declinedDmConvIdsRef.current = new Set((raw ? JSON.parse(raw) : []).map(String));
      } catch {
        declinedDmConvIdsRef.current = new Set();
      }
    }
    return declinedDmConvIdsRef.current;
  }, []);
  const persistDeclinedDm = useCallback(() => {
    try {
      sessionStorage.setItem('slide_dm_voice_declined', JSON.stringify([...getDeclinedDmConvIds()]));
    } catch {
      /* ignore */
    }
  }, [getDeclinedDmConvIds]);
  const addDeclinedDmConv = useCallback(
    (id) => {
      if (id == null || Number.isNaN(Number(id))) return;
      getDeclinedDmConvIds().add(String(id));
      persistDeclinedDm();
    },
    [getDeclinedDmConvIds, persistDeclinedDm]
  );
  const removeDeclinedDmConv = useCallback(
    (id) => {
      if (id == null) return;
      getDeclinedDmConvIds().delete(String(id));
      persistDeclinedDm();
    },
    [getDeclinedDmConvIds, persistDeclinedDm]
  );
  const hasDeclinedDmConv = useCallback(
    (id) => {
      if (id == null) return false;
      return getDeclinedDmConvIds().has(String(id));
    },
    [getDeclinedDmConvIds]
  );

  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  /** Original getDisplayMedia stream (stop these to release capture). */
  const screenShareRawStreamRef = useRef(null);
  const screenShareAudioContextRef = useRef(null);
  const screenShareGainNodeRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const remoteAudioRefs = useRef({});
  /** One MediaStream per remote peer mixing mic + screen-share audio (multiple receivers). */
  const remoteMergedAudioStreamsRef = useRef({});
  const iceCandidateQueueRef = useRef({});
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingCheckRef = useRef(null);
  const wasSpeakingRef = useRef(false);
  const voiceChannelIdRef = useRef(null);
  const voiceConversationIdRef = useRef(null);
  const voiceTeamIdRef = useRef(null);
  const myVoiceClientIdRef = useRef(createVoiceClientId());
  const rotateVoiceClientId = useCallback(() => {
    const next = crypto.randomUUID();
    try { sessionStorage.setItem(VOICE_CLIENT_STORAGE_KEY, next); } catch (_) {}
    myVoiceClientIdRef.current = next;
  }, []);
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);

  useEffect(() => {
    voiceChannelIdRef.current = voiceChannelId;
  }, [voiceChannelId]);

  useEffect(() => {
    voiceTeamIdRef.current = voiceTeamId;
  }, [voiceTeamId]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    isDeafenedRef.current = isDeafened;
  }, [isMuted, isDeafened]);

  useEffect(() => {
    voiceConversationIdRef.current = voiceConversationId;
  }, [voiceConversationId]);

  // After auth hydrates or profile updates, fix participant rows for the active call.
  useEffect(() => {
    if (!user?.id) return;
    if (voiceChannelId == null && voiceConversationId == null) return;
    setVoiceUsers((prev) => {
      const next = { ...prev };
      if (voiceChannelId != null && Array.isArray(prev[voiceChannelId])) {
        next[voiceChannelId] = patchVoiceParticipantListForAuth(
          prev[voiceChannelId],
          user,
          isMutedRef,
          isDeafenedRef
        );
      }
      if (voiceConversationId != null) {
        const dmKey = `dm_${voiceConversationId}`;
        if (Array.isArray(prev[dmKey])) {
          next[dmKey] = patchVoiceParticipantListForAuth(prev[dmKey], user, isMutedRef, isDeafenedRef);
        }
      }
      return next;
    });
  }, [user?.id, user?.display_name, user?.avatar_url, voiceChannelId, voiceConversationId]);

  // After sleep / backgrounding, socket may stay "connected" while server voice state was cleared.
  useEffect(() => {
    if (!socket) return;
    let timer;
    const onVisible = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!socket.connected) return;
        const ch = coercePositiveInt(voiceChannelIdRef.current);
        const dm = voiceConversationIdRef.current;
        if (ch != null) {
          const tid = coercePositiveInt(voiceTeamIdRef.current);
          socket.emit('voice_join', {
            channelId: ch,
            teamId: tid ?? 0,
            voiceClientId: myVoiceClientIdRef.current,
          });
          socket.emit('voice_state', {
            channelId: ch,
            muted: isMutedRef.current,
            deafened: isDeafenedRef.current,
          });
        } else if (dm != null) {
          const convId = typeof dm === 'number' ? dm : parseInt(String(dm), 10);
          if (!Number.isNaN(convId)) {
            socket.emit('voice_join_dm', {
              conversationId: convId,
              voiceClientId: myVoiceClientIdRef.current,
            });
            socket.emit('voice_state_dm', {
              conversationId: convId,
              muted: isMutedRef.current,
              deafened: isDeafenedRef.current,
            });
          }
        }
      }, 500);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [socket]);

  // ── Sync voice state to Electron tray icon ──────────────────────────────────
  useEffect(() => {
    if (!window.electron?.setTrayVoiceState) return;
    const inCall = !!(voiceChannelId || voiceConversationId);
    if (!inCall) {
      window.electron.setTrayVoiceState('idle');
      return;
    }
    if (isMuted) {
      window.electron.setTrayVoiceState('muted');
    } else if (speakingKey(user?.id) && speakingUsers.has(speakingKey(user?.id))) {
      window.electron.setTrayVoiceState('speaking');
    } else {
      window.electron.setTrayVoiceState('call');
    }
  }, [voiceChannelId, voiceConversationId, isMuted, speakingUsers, user?.id]);

  // ── Listen for tray context menu actions (uses refs to avoid dep issues) ────
  const trayActionsRef = useRef({});
  useEffect(() => {
    if (!window.electron) return;
    const cleanupMute = window.electron.onTrayToggleMute?.(() => {
      trayActionsRef.current.toggleMute?.();
    });
    const cleanupLeave = window.electron.onTrayLeaveCall?.(() => {
      if (voiceChannelIdRef.current) trayActionsRef.current.leaveVoice?.();
      else if (voiceConversationIdRef.current) trayActionsRef.current.leaveVoiceDM?.();
    });
    // When the app is actually quitting (not just minimizing to tray), leave voice
    const cleanupQuit = window.electron.onAppBeforeQuit?.(() => {
      if (voiceChannelIdRef.current) trayActionsRef.current.leaveVoice?.();
      else if (voiceConversationIdRef.current) trayActionsRef.current.leaveVoiceDM?.();
    });
    return () => { cleanupMute?.(); cleanupLeave?.(); cleanupQuit?.(); };
  }, []);

  const getAudioConstraints = useCallback((useDeviceId = true) => ({
    audio: {
      deviceId: useDeviceId && settings?.input_device && settings.input_device !== 'default'
        ? { exact: settings.input_device }
        : undefined,
      echoCancellation: settings?.echo_cancellation ?? true,
      noiseSuppression: settings?.noise_suppression ?? true,
      autoGainControl: settings?.auto_gain_control ?? true,
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
      channelCount: { ideal: 1 },
      latency: { ideal: 0.01 },
    }
  }), [settings?.input_device, settings?.echo_cancellation, settings?.noise_suppression, settings?.auto_gain_control]);

  const acquireMicStream = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access not available in this context.');
    }
    try {
      return await navigator.mediaDevices.getUserMedia(getAudioConstraints(true));
    } catch (err) {
      console.warn('getUserMedia failed with saved device, retrying with default:', err.message);
      return await navigator.mediaDevices.getUserMedia(getAudioConstraints(false));
    }
  }, [getAudioConstraints]);

  const startSpeakingDetection = useCallback(async (stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);

      // High-pass filter: removes low-frequency rumble/hum (< 80 Hz)
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 80;
      highpass.Q.value = 0.7;

      // Input gain from user settings
      const gainNode = ctx.createGain();
      gainNode.gain.value = (settings?.input_volume ?? 100) / 100;

      // Compressor: prevents clipping/distortion from loud sounds
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;

      // Processed output → MediaStreamDestination for peer connections
      const destination = ctx.createMediaStreamDestination();

      // Analyser for speaking detection (taps the processed signal)
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.4;

      // Pipeline: source → highpass → gain → compressor → destination + analyser
      source.connect(highpass);
      highpass.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(destination);
      compressor.connect(analyserRef.current);

      processedStreamRef.current = destination.stream;

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      speakingCheckRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const isSpeaking = avg > SPEAKING_THRESHOLD;

        if (isSpeaking !== wasSpeakingRef.current) {
          wasSpeakingRef.current = isSpeaking;
          const sk = speakingKey(user?.id);
          setSpeakingUsers(prev => {
            const next = new Set(prev);
            if (!sk) return next;
            if (isSpeaking) next.add(sk);
            else next.delete(sk);
            return next;
          });
          if (socket) {
            if (voiceChannelIdRef.current) {
              socket.emit('voice_speaking', {
                channelId: voiceChannelIdRef.current,
                speaking: isSpeaking,
              });
            } else if (voiceConversationIdRef.current) {
              socket.emit('voice_speaking_dm', {
                conversationId: voiceConversationIdRef.current,
                speaking: isSpeaking,
              });
            }
          }
        }
      }, SPEAKING_CHECK_INTERVAL);
    } catch (err) {
      console.error('Speaking detection error:', err);
    }
  }, [socket, user?.id, settings?.input_volume]);

  const stopSpeakingDetection = useCallback(() => {
    if (speakingCheckRef.current) {
      clearInterval(speakingCheckRef.current);
      speakingCheckRef.current = null;
    }
    if (processedStreamRef.current) {
      processedStreamRef.current.getTracks().forEach(t => t.stop());
      processedStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    wasSpeakingRef.current = false;
  }, []);

  const disposeScreenShareAudioPipeline = useCallback(() => {
    screenShareGainNodeRef.current = null;
    const ctx = screenShareAudioContextRef.current;
    screenShareAudioContextRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, []);

  const prepareDisplayCaptureForSend = useCallback(async (rawStream) => {
    screenShareRawStreamRef.current = rawStream;
    const videoTrack = rawStream.getVideoTracks()[0];
    const rawAudio = rawStream.getAudioTracks()[0];
    const vol = Math.max(0, Math.min(100, Number(settings?.screen_share_capture_volume ?? 100))) / 100;

    if (!rawAudio) {
      screenStreamRef.current = rawStream;
      screenShareGainNodeRef.current = null;
      setOwnScreenStream(videoTrack ? new MediaStream([videoTrack]) : null);
      setScreenShareCaptureAudioActive(false);
      return screenStreamRef.current;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      screenStreamRef.current = rawStream;
      setOwnScreenStream(videoTrack ? new MediaStream([videoTrack]) : null);
      setScreenShareCaptureAudioActive(false);
      return screenStreamRef.current;
    }

    const ctx = new AC({ sampleRate: 48000 });
    screenShareAudioContextRef.current = ctx;
    if (ctx.state === 'suspended') await ctx.resume();

    const source = ctx.createMediaStreamSource(new MediaStream([rawAudio]));
    const gainNode = ctx.createGain();
    gainNode.gain.value = vol;
    screenShareGainNodeRef.current = gainNode;
    const dest = ctx.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(dest);
    const outAudio = dest.stream.getAudioTracks()[0];

    const sendStream = new MediaStream();
    if (videoTrack) sendStream.addTrack(videoTrack);
    sendStream.addTrack(outAudio);
    screenStreamRef.current = sendStream;
    setOwnScreenStream(videoTrack ? new MediaStream([videoTrack]) : null);
    setScreenShareCaptureAudioActive(true);
    return sendStream;
  }, [settings?.screen_share_capture_volume]);

  const teardownLocalScreenCapture = useCallback(() => {
    disposeScreenShareAudioPipeline();
    const raw = screenShareRawStreamRef.current;
    screenShareRawStreamRef.current = null;
    screenStreamRef.current = null;
    if (raw) raw.getTracks().forEach(t => t.stop());
    setScreenShareCaptureAudioActive(false);
    setOwnScreenStream(null);
  }, [disposeScreenShareAudioPipeline]);

  useEffect(() => {
    const g = screenShareGainNodeRef.current;
    if (!g) return;
    const v = Math.max(0, Math.min(100, Number(settings?.screen_share_capture_volume ?? 100))) / 100;
    g.gain.value = v;
  }, [settings?.screen_share_capture_volume]);

  const setScreenShareCaptureVolume = useCallback((value) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(value))));
    updateSetting?.('screen_share_capture_volume', n);
    if (screenShareGainNodeRef.current) {
      screenShareGainNodeRef.current.gain.value = n / 100;
    }
  }, [updateSetting]);

  /** If WebRTC media flows but the socket roster missed an update, still show them as in call. */
  const ensurePeerInVoiceRoster = useCallback((peerUserId) => {
    if (peerUserId == null || peerUserId === '') return;
    if (sameUserId(peerUserId, user?.id)) return;
    const n = Number(peerUserId);
    const stableId = Number.isFinite(n) && n > 0 ? n : peerUserId;

    setVoiceUsers((prev) => {
      const ch = voiceChannelIdRef.current;
      const dm = voiceConversationIdRef.current;
      const placeholder = {
        id: stableId,
        display_name: 'User',
        avatar_url: null,
        muted: false,
        deafened: false,
      };
      if (ch != null) {
        const list = prev[ch] || [];
        if (list.some((u) => sameUserId(u.id, stableId))) return prev;
        return { ...prev, [ch]: [...list, placeholder] };
      }
      if (dm != null) {
        const dkey = `dm_${dm}`;
        const list = prev[dkey] || [];
        if (list.some((u) => sameUserId(u.id, stableId))) return prev;
        return { ...prev, [dkey]: [...list, placeholder] };
      }
      return prev;
    });
  }, [user?.id]);

  const setStreamVolumeForUser = useCallback((userId, percent) => {
    if (userId == null || userId === '') return;
    const n = Math.max(0, Math.min(100, Math.round(Number(percent))));
    setStreamVolumeByUserId((prev) => ({ ...prev, [String(userId)]: n }));
  }, []);

  const getStreamVolumePercent = useCallback((userId) => {
    if (userId == null || userId === '') return 100;
    const v = streamVolumeByUserId[String(userId)];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 100;
  }, [streamVolumeByUserId]);

  const getListenVolume01 = useCallback((userId) => {
    const base = (settings?.output_volume ?? 100) / 100;
    return Math.min(1, Math.max(0, base * (getStreamVolumePercent(userId) / 100)));
  }, [settings?.output_volume, getStreamVolumePercent]);

  const playRemoteStream = useCallback((peerKeyStr, stream) => {
    const { userId: rosterUserId } = parsePeerKey(peerKeyStr);
    ensurePeerInVoiceRoster(rosterUserId);
    if (voiceConversationIdRef.current) {
      setDmRemoteMediaReady(true);
    }
    let audio = remoteAudioRefs.current[peerKeyStr];
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      remoteAudioRefs.current[peerKeyStr] = audio;
    }
    audio.srcObject = stream;
    audio.volume = getListenVolume01(rosterUserId);
    if (settings?.output_device && settings.output_device !== 'default' && audio.setSinkId) {
      audio.setSinkId(settings.output_device).catch(() => {});
    }
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        const retry = () => {
          audio.play().catch(() => {});
          document.removeEventListener('click', retry);
          document.removeEventListener('keydown', retry);
        };
        document.addEventListener('click', retry, { once: true });
        document.addEventListener('keydown', retry, { once: true });
      });
    }
  }, [getListenVolume01, settings?.output_device, ensurePeerInVoiceRoster]);

  useEffect(() => {
    for (const peerKeyStr of Object.keys(remoteAudioRefs.current)) {
      const audio = remoteAudioRefs.current[peerKeyStr];
      if (!audio) continue;
      const { userId: uid } = parsePeerKey(peerKeyStr);
      audio.volume = getListenVolume01(uid);
    }
  }, [getListenVolume01]);

  const cleanupPeerConnection = useCallback((peerKeyStr) => {
    delete iceCandidateQueueRef.current[peerKeyStr];
    const pc = peerConnectionsRef.current[peerKeyStr];
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
      delete peerConnectionsRef.current[peerKeyStr];
    }
    const audio = remoteAudioRefs.current[peerKeyStr];
    if (audio) {
      audio.srcObject = null;
      audio.pause();
      audio.remove();
      delete remoteAudioRefs.current[peerKeyStr];
    }
    delete remoteMergedAudioStreamsRef.current[peerKeyStr];
    setRemoteVideoStreams(prev => {
      const next = { ...prev };
      delete next[peerKeyStr];
      return next;
    });
  }, []);

  const emitVoiceSignal = useCallback((targetUserId, targetVoiceClientId, signal) => {
    if (!socket || !targetVoiceClientId) return;
    const uid = coercePositiveInt(targetUserId) ?? (Number.isFinite(Number(targetUserId)) ? Number(targetUserId) : null);
    if (uid == null) return;
    socket.emit('voice_signal', {
      targetUserId: uid,
      targetVoiceClientId,
      signal,
    });
  }, [socket]);

  const createPeerConnection = useCallback((targetUserId, targetVoiceClientId, isInitiator) => {
    if (targetVoiceClientId == null || targetVoiceClientId === '') return null;
    const pk = peerKey(targetUserId, targetVoiceClientId);
    cleanupPeerConnection(pk);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current[pk] = pc;

    // Use processed (filtered + compressed) audio stream if available, raw otherwise
    const audioStream = processedStreamRef.current || localStreamRef.current;
    if (audioStream) {
      audioStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, audioStream);
      });
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, screenStreamRef.current);
      });
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, cameraStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      if (event.track.kind === 'video') {
        ensurePeerInVoiceRoster(targetUserId);
        event.track.onended = () => {
          setRemoteVideoStreams(prev => {
            const next = { ...prev };
            delete next[pk];
            return next;
          });
        };
        setRemoteVideoStreams(prev => ({ ...prev, [pk]: stream }));
      } else {
        let merged = remoteMergedAudioStreamsRef.current[pk];
        if (!merged) {
          merged = new MediaStream();
          remoteMergedAudioStreamsRef.current[pk] = merged;
        }
        if (!merged.getTracks().includes(event.track)) {
          merged.addTrack(event.track);
        }
        event.track.onended = () => {
          try {
            merged.removeTrack(event.track);
          } catch (_) {}
          if (merged.getTracks().length === 0) {
            delete remoteMergedAudioStreamsRef.current[pk];
          }
        };
        playRemoteStream(pk, merged);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        const cand = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
        emitVoiceSignal(targetUserId, targetVoiceClientId, { type: 'candidate', candidate: cand });
      }
    };

    pc.oniceconnectionstatechange = () => {
      const ice = pc.iceConnectionState;
      if (voiceConversationIdRef.current && (ice === 'connected' || ice === 'completed')) {
        setDmRemoteMediaReady(true);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        if (voiceConversationIdRef.current) {
          setDmRemoteMediaReady(true);
        }
        configureAudioSender(pc);
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          configureVideoSender(pc, hasNitroRef.current);
        }
      } else if (state === 'failed') {
        console.warn(`Peer connection to ${pk} failed, attempting ICE restart`);
        pc.createOffer({ iceRestart: true })
          .then(offer => {
            offer.sdp = setOpusAttributes(offer.sdp);
            return pc.setLocalDescription(offer);
          })
          .then(() => {
            emitVoiceSignal(targetUserId, targetVoiceClientId, { type: 'offer', sdp: pc.localDescription });
          })
          .catch(err => console.error('ICE restart error:', err));
      } else if (state === 'disconnected') {
        console.warn(`Peer connection to ${pk} disconnected, waiting for recovery...`);
      }
    };

    if (isInitiator) {
      pc.createOffer()
        .then(offer => {
          offer.sdp = setOpusAttributes(offer.sdp);
          return pc.setLocalDescription(offer);
        })
        .then(() => {
          emitVoiceSignal(targetUserId, targetVoiceClientId, { type: 'offer', sdp: pc.localDescription });
        })
        .catch(err => console.error('Offer creation error:', err));
    }

    return pc;
  }, [socket, cleanupPeerConnection, playRemoteStream, ensurePeerInVoiceRoster, emitVoiceSignal]);

  useEffect(() => {
    if (!user?.has_nitro) return;
    reconfigureAllVideoSenders(peerConnectionsRef, true);
  }, [user?.has_nitro]);

  const cleanupAllConnections = useCallback(() => {
    Object.keys(peerConnectionsRef.current).forEach(cleanupPeerConnection);
    peerConnectionsRef.current = {};

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    teardownLocalScreenCapture();
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    setIsScreenSharing(false);
    setIsCameraOn(false);
    setOwnCameraStream(null);
    setScreenSharingUserIds(new Set());
    setVideoEnabledUserIds(new Set());
    setRemoteVideoStreams({});
    setExpandedLiveView(null);

    stopSpeakingDetection();
    Object.values(remoteAudioRefs.current).forEach(a => {
      a.srcObject = null;
      a.pause();
      a.remove();
    });
    remoteAudioRefs.current = {};
    remoteMergedAudioStreamsRef.current = {};
    setStreamVolumeByUserId({});
    setDmRemoteMediaReady(false);
  }, [cleanupPeerConnection, stopSpeakingDetection, teardownLocalScreenCapture]);

  // After Socket.IO reconnect: new voice client id + full media/WebRTC refresh (multi-device safe).
  useEffect(() => {
    if (!socket) return;
    const onReconnect = async () => {
      const ch = coercePositiveInt(voiceChannelIdRef.current);
      const dm = voiceConversationIdRef.current;
      if (ch == null && dm == null) return;

      rotateVoiceClientId();
      cleanupAllConnections();

      try {
        const stream = await acquireMicStream();
        localStreamRef.current = stream;
        await startSpeakingDetection(stream);
        isMutedRef.current = false;
        setIsMuted(false);
      } catch {
        isMutedRef.current = true;
        setIsMuted(true);
      }

      if (ch != null) {
        const teamIdVal = coercePositiveInt(voiceTeamIdRef.current);
        socket.emit('voice_join', {
          channelId: ch,
          teamId: teamIdVal ?? 0,
          voiceClientId: myVoiceClientIdRef.current,
        });
        socket.emit('voice_state', {
          channelId: ch,
          muted: isMutedRef.current,
          deafened: isDeafenedRef.current,
        });
      }
      if (dm != null) {
        socket.emit('voice_join_dm', {
          conversationId: dm,
          voiceClientId: myVoiceClientIdRef.current,
        });
        socket.emit('voice_state_dm', {
          conversationId: dm,
          muted: isMutedRef.current,
          deafened: isDeafenedRef.current,
        });
      }
    };
    socket.io.on('reconnect', onReconnect);
    return () => socket.io.off('reconnect', onReconnect);
  }, [socket, rotateVoiceClientId, cleanupAllConnections, acquireMicStream, startSpeakingDetection]);

  const joinVoice = useCallback(async (channelId, teamId, channelName) => {
    const chId = coercePositiveInt(channelId);
    const tId = coercePositiveInt(teamId);
    if (chId == null) {
      console.warn('joinVoice: invalid channelId', channelId);
      return;
    }

    const currentCh = coercePositiveInt(voiceChannelIdRef.current);
    if (currentCh === chId) {
      if (user?.id) {
        setVoiceUsers((prev) => {
          const cur = prev[chId];
          if (!Array.isArray(cur)) return prev;
          return {
            ...prev,
            [chId]: patchVoiceParticipantListForAuth(cur, user, isMutedRef, isDeafenedRef),
          };
        });
      }
      // Server drops voice on socket disconnect; we may still be "in" voice locally with WebRTC.
      if (socket?.connected) {
        socket.emit('voice_join', {
          channelId: chId,
          teamId: tId ?? 0,
          voiceClientId: myVoiceClientIdRef.current,
        });
        socket.emit('voice_state', {
          channelId: chId,
          muted: isMutedRef.current,
          deafened: isDeafenedRef.current,
        });
      }
      return;
    }

    setConnectionState('connecting');
    setVoiceChannelId(chId);
    setVoiceTeamId(tId);
    setVoiceChannelName(channelName);
    setSpeakingUsers(new Set());

    // Wait for socket to be connected (handles returning after idle/disconnect)
    if (socket && !socket.connected) {
      try {
        await waitForSocketConnected(socket, 5000);
      } catch {
        console.warn('Socket reconnect timed out, joining anyway...');
      }
    }

    // Leave any current voice (server or DM) — after socket is ready
    const prevJoined = coercePositiveInt(voiceChannelIdRef.current);
    if (prevJoined != null && prevJoined !== chId) {
      rotateVoiceClientId();
      if (socket) socket.emit('voice_leave', { channelId: prevJoined });
      cleanupAllConnections();
      setVoiceUsers(prev => {
        const next = { ...prev };
        if (next[prevJoined]) {
          next[prevJoined] = filterOutSelfInVoiceList(next[prevJoined], user?.id);
          if (next[prevJoined].length === 0) delete next[prevJoined];
        }
        return next;
      });
    }
    if (voiceConversationIdRef.current) {
      rotateVoiceClientId();
      if (socket) socket.emit('voice_leave_dm', { conversationId: voiceConversationIdRef.current });
      cleanupAllConnections();
      const dmKey = `dm_${voiceConversationIdRef.current}`;
      setVoiceUsers(prev => {
        const next = { ...prev };
        if (next[dmKey]) {
          next[dmKey] = filterOutSelfInVoiceList(next[dmKey], user?.id);
          if (next[dmKey].length === 0) delete next[dmKey];
        }
        return next;
      });
      setVoiceConversationId(null);
      setVoiceConversationName('');
      setDmCallCallerId(null);
    }

    // Acquire mic (run in parallel with socket wait when possible)
    let hasMic = false;
    try {
      const stream = await acquireMicStream();
      localStreamRef.current = stream;
      await startSpeakingDetection(stream);
      hasMic = true;
    } catch (err) {
      console.warn('No microphone available, joining as listen-only:', err?.message);
      isMutedRef.current = true;
      setIsMuted(true);
    }

    const selfUser = user?.id
      ? {
          id: user.id,
          display_name: user.display_name ?? 'User',
          avatar_url: user.avatar_url ?? null,
          muted: !hasMic,
          deafened: false,
        }
      : null;

    // Do not merge prev[channelId]: it is often stale (missed voice_user_left while offline / tab away).
    // Sidebar showed ghosts; merging here kept them until voice_users arrived. Server list is source of truth.
    setVoiceUsers((prev) => ({
      ...prev,
      [chId]: selfUser ? [selfUser] : [],
    }));

    if (socket?.connected) {
      socket.emit('voice_join', {
        channelId: chId,
        teamId: tId ?? 0,
        voiceClientId: myVoiceClientIdRef.current,
      });
      if (!hasMic) {
        socket.emit('voice_state', { channelId: chId, muted: true, deafened: false });
      }
    }

    setConnectionState('connected');
    setIsDeafened(false);
    window.electron?.blockPowerSave?.();
  }, [socket, user, acquireMicStream, startSpeakingDetection, cleanupAllConnections, rotateVoiceClientId]);

  const leaveVoice = useCallback(() => {
    if (!voiceChannelIdRef.current) return;

    const channelId = voiceChannelIdRef.current;

    if (socket) {
      socket.emit('voice_leave', { channelId });
    }

    cleanupAllConnections();

    setVoiceUsers((prev) => {
      const next = { ...prev };
      if (next[channelId]) {
        next[channelId] = filterOutSelfInVoiceList(next[channelId], user?.id);
        if (next[channelId].length === 0) delete next[channelId];
      }
      return next;
    });

    setSpeakingUsers(new Set());
    setVoiceChannelId(null);
    setVoiceTeamId(null);
    setVoiceChannelName('');
    setVoiceViewMinimized(false);
    setConnectionState('disconnected');
    setIsMuted(false);
    setIsDeafened(false);
    window.electron?.unblockPowerSave?.();
  }, [socket, user?.id, cleanupAllConnections]);

  const dismissIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const rejectIncomingCall = useCallback(
    (conversationId) => {
      if (conversationId != null) {
        const id = typeof conversationId === 'number' ? conversationId : parseInt(conversationId, 10);
        if (!Number.isNaN(id)) {
          addDeclinedDmConv(id);
          if (socket) socket.emit('voice_decline_dm', { conversationId: id });
        }
      }
      setIncomingCall(null);
    },
    [socket, addDeclinedDmConv]
  );

  const joinVoiceDM = useCallback(async (conversationId, otherUserName) => {
    const convId = typeof conversationId === 'number' ? conversationId : parseInt(conversationId, 10);
    if (Number.isNaN(convId)) return;
    removeDeclinedDmConv(convId);
    if (voiceConversationIdRef.current === convId) {
      if (user?.id) {
        const dmKey = `dm_${convId}`;
        setVoiceUsers((prev) => {
          const cur = prev[dmKey];
          if (!Array.isArray(cur)) return prev;
          return {
            ...prev,
            [dmKey]: patchVoiceParticipantListForAuth(cur, user, isMutedRef, isDeafenedRef),
          };
        });
      }
      const rejoinDm = () => {
        if (!socket?.connected) return;
        socket.emit('voice_join_dm', {
          conversationId: convId,
          voiceClientId: myVoiceClientIdRef.current,
        });
        socket.emit('voice_state_dm', {
          conversationId: convId,
          muted: isMutedRef.current,
          deafened: isDeafenedRef.current,
        });
      };
      rejoinDm();
      if (socket && !socket.connected) {
        socket.once('connect', rejoinDm);
      }
      return;
    }

    // Must capture before overwriting refs — switching DM conversations left the old room
    // without client cleanup (stale RTCPeerConnections, no voice_leave_dm), breaking the next call.
    const rawPrevDm = voiceConversationIdRef.current;
    let previousDmConversationId = null;
    if (rawPrevDm != null) {
      const p = typeof rawPrevDm === 'number' ? rawPrevDm : parseInt(String(rawPrevDm), 10);
      if (!Number.isNaN(p) && p !== convId) previousDmConversationId = p;
    }

    setIncomingCall(prev => (prev?.conversationId === convId || prev?.conversationId === conversationId ? null : prev));

    setDmFloatingPanelCollapsed(false);
    setConnectionState('connecting');
    setDmRemoteMediaReady(false);
    setVoiceConversationId(convId);
    voiceConversationIdRef.current = convId;
    setVoiceConversationName(otherUserName || 'DM Call');

    // Wait for socket to be connected (handles returning after idle/disconnect)
    if (socket && !socket.connected) {
      try {
        await waitForSocketConnected(socket, 15000);
      } catch {
        console.warn('Socket reconnect timed out for DM, joining anyway...');
      }
    }

    // Leave any current voice (server or DM) — after socket is ready
    if (voiceChannelIdRef.current) {
      rotateVoiceClientId();
      if (socket) socket.emit('voice_leave', { channelId: voiceChannelIdRef.current });
      cleanupAllConnections();
      setVoiceUsers(prev => {
        const next = { ...prev };
        const prevCh = voiceChannelIdRef.current;
        if (next[prevCh]) {
          next[prevCh] = filterOutSelfInVoiceList(next[prevCh], user?.id);
          if (next[prevCh].length === 0) delete next[prevCh];
        }
        return next;
      });
      setVoiceChannelId(null);
      setVoiceTeamId(null);
      setVoiceChannelName('');
    }
    if (previousDmConversationId != null) {
      rotateVoiceClientId();
      if (socket) socket.emit('voice_leave_dm', { conversationId: previousDmConversationId });
      cleanupAllConnections();
      const prevDmKey = `dm_${previousDmConversationId}`;
      setVoiceUsers(prev => {
        const next = { ...prev };
        if (next[prevDmKey]) {
          next[prevDmKey] = filterOutSelfInVoiceList(next[prevDmKey], user?.id);
          if (next[prevDmKey].length === 0) delete next[prevDmKey];
        }
        return next;
      });
    }

    let hasMic = false;
    try {
      const stream = await acquireMicStream();
      localStreamRef.current = stream;
      await startSpeakingDetection(stream);
      hasMic = true;
    } catch (err) {
      console.warn('No microphone available, joining DM as listen-only:', err?.message);
      isMutedRef.current = true;
      setIsMuted(true);
    }

    const selfUser = user?.id
      ? {
          id: user.id,
          display_name: user.display_name ?? 'User',
          avatar_url: user.avatar_url ?? null,
          muted: !hasMic,
          deafened: false,
        }
      : null;

    const dmKey = `dm_${convId}`;
    setVoiceUsers((prev) => ({
      ...prev,
      [dmKey]: selfUser ? [selfUser] : [],
    }));

    const emitDmJoin = () => {
      if (!socket?.connected) return;
      socket.emit('voice_join_dm', {
        conversationId: convId,
        voiceClientId: myVoiceClientIdRef.current,
      });
      if (!hasMic) {
        socket.emit('voice_state_dm', { conversationId: convId, muted: true, deafened: false });
      }
    };
    emitDmJoin();
    if (socket && !socket.connected) {
      socket.once('connect', emitDmJoin);
    }

    setConnectionState('connected');
    window.electron?.blockPowerSave?.();
  }, [socket, user, acquireMicStream, startSpeakingDetection, cleanupAllConnections, rotateVoiceClientId, removeDeclinedDmConv]);

  const leaveVoiceDM = useCallback(() => {
    if (!voiceConversationIdRef.current) return;

    const conversationId = voiceConversationIdRef.current;
    const dmKey = `dm_${conversationId}`;

    if (socket) {
      socket.emit('voice_leave_dm', { conversationId });
    }

    cleanupAllConnections();

    setVoiceUsers((prev) => {
      const next = { ...prev };
      if (next[dmKey]) {
        next[dmKey] = filterOutSelfInVoiceList(next[dmKey], user?.id);
        if (next[dmKey].length === 0) delete next[dmKey];
      }
      return next;
    });

    setSpeakingUsers(new Set());
    setVoiceConversationId(null);
    voiceConversationIdRef.current = null;
    setVoiceConversationName('');
    setDmCallCallerId(null);
    removeDeclinedDmConv(conversationId);
    setVoiceViewMinimized(false);
    setDmFloatingPanelCollapsed(false);
    setConnectionState('disconnected');
    setDmRemoteMediaReady(false);
    setIsMuted(false);
    setIsDeafened(false);
    window.electron?.unblockPowerSave?.();
  }, [socket, user?.id, cleanupAllConnections, removeDeclinedDmConv]);

  const authUserIdRef = useRef(null);
  const authVoiceHydratedRef = useRef(false);
  useEffect(() => {
    const cur = user?.id ?? null;
    if (!authVoiceHydratedRef.current) {
      authVoiceHydratedRef.current = true;
      authUserIdRef.current = cur;
      return;
    }
    const prev = authUserIdRef.current;
    authUserIdRef.current = cur;
    const leftOrSwitched =
      (cur == null && prev != null) ||
      (cur != null && prev != null && String(prev) !== String(cur));
    if (!leftOrSwitched) return;
    if (voiceChannelIdRef.current) leaveVoice();
    else if (voiceConversationIdRef.current) leaveVoiceDM();
    else cleanupAllConnections();
    if (cur != null && prev != null && String(prev) !== String(cur)) {
      rotateVoiceClientId();
    }
  }, [user?.id, leaveVoice, leaveVoiceDM, cleanupAllConnections, rotateVoiceClientId]);

  const resolveScreenSharePicker = useCallback((sourceId) => {
    screenShareResolveRef.current?.(sourceId ?? null);
    screenShareResolveRef.current = null;
    setScreenSharePicker({ visible: false, sources: [] });
  }, []);

  const ringVoiceDM = useCallback(() => {
    if (!socket || !voiceConversationIdRef.current) return;
    socket.emit('voice_ring_dm', { conversationId: voiceConversationIdRef.current });
  }, [socket]);

  const renegotiateAllPeerConnections = useCallback(async () => {
    const peerKeys = Object.keys(peerConnectionsRef.current);
    for (const pk of peerKeys) {
      const pc = peerConnectionsRef.current[pk];
      if (!pc || pc.signalingState === 'closed') continue;
      const { userId: tUid, voiceClientId: tVc } = parsePeerKey(pk);
      if (!tVc) continue;
      try {
        const offer = await pc.createOffer();
        offer.sdp = setOpusAttributes(offer.sdp);
        await pc.setLocalDescription(offer);
        emitVoiceSignal(tUid, tVc, { type: 'offer', sdp: pc.localDescription });
      } catch (err) {
        console.error('Renegotiation offer failed:', err);
      }
    }
  }, [emitVoiceSignal]);

  const toggleMute = useCallback(async () => {
    const currentlyMuted = isMuted;
    if (currentlyMuted) {
      // User wants to unmute — check if we have a mic
      if (!localStreamRef.current || !localStreamRef.current.getAudioTracks().length) {
        notify.warning('No microphone detected');
        try {
          const stream = await acquireMicStream();
          localStreamRef.current = stream;
          await startSpeakingDetection(stream);
          isMutedRef.current = false;
          setIsMuted(false);
          if (isDeafened) {
            setIsDeafened(false);
            isDeafenedRef.current = false;
            Object.values(remoteAudioRefs.current).forEach(a => { a.muted = false; });
          }
          notify.success('Microphone connected');
          if (socket) {
            if (voiceChannelIdRef.current) {
              socket.emit('voice_state', { channelId: voiceChannelIdRef.current, muted: false, deafened: false });
            } else if (voiceConversationIdRef.current) {
              socket.emit('voice_state_dm', { conversationId: voiceConversationIdRef.current, muted: false, deafened: false });
            }
          }
          setVoiceUsers(prev2 => {
            const chId = voiceChannelIdRef.current || (voiceConversationIdRef.current ? `dm_${voiceConversationIdRef.current}` : null);
            if (!chId || !prev2[chId]) return prev2;
            return { ...prev2, [chId]: prev2[chId].map(u => sameUserId(u.id, user?.id) ? { ...u, muted: false, deafened: false } : u) };
          });
          // Add our audio tracks to existing peer connections that were created without
          const audioStream = processedStreamRef.current || localStreamRef.current;
          if (audioStream) {
            Object.keys(peerConnectionsRef.current).forEach(targetUserId => {
              const pc = peerConnectionsRef.current[targetUserId];
              if (!pc || pc.signalingState === 'closed') return;
              const hasAudio = pc.getSenders().some(s => s.track?.kind === 'audio');
              if (!hasAudio) {
                audioStream.getAudioTracks().forEach(track => pc.addTrack(track, audioStream));
              }
            });
          }
          renegotiateAllPeerConnections();
        } catch (err) {
          notify.error('Could not access microphone. Check Settings > Voice');
        }
        return;
      }
    }

    setIsMuted(prev => {
      const newMuted = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      }
      if (processedStreamRef.current) {
        processedStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      }
      if (newMuted) {
        wasSpeakingRef.current = false;
        setSpeakingUsers(p => {
          const sk = speakingKey(user?.id);
          if (!sk) return p;
          const next = new Set(p);
          next.delete(sk);
          return next;
        });
      }
      const newDeafened = newMuted ? isDeafened : false;
      if (!newMuted && isDeafened) {
        setIsDeafened(false);
        isDeafenedRef.current = false;
        Object.values(remoteAudioRefs.current).forEach(a => { a.muted = false; });
      }
      if (socket) {
        if (voiceChannelIdRef.current) {
          socket.emit('voice_state', {
            channelId: voiceChannelIdRef.current,
            muted: newMuted,
            deafened: newDeafened,
          });
        } else if (voiceConversationIdRef.current) {
          socket.emit('voice_state_dm', {
            conversationId: voiceConversationIdRef.current,
            muted: newMuted,
            deafened: newDeafened,
          });
        }
      }
      setVoiceUsers(prev2 => {
        const chId = voiceChannelIdRef.current || (voiceConversationIdRef.current ? `dm_${voiceConversationIdRef.current}` : null);
        if (!chId || !prev2[chId]) return prev2;
        return {
          ...prev2,
          [chId]: prev2[chId].map(u => sameUserId(u.id, user?.id) ? { ...u, muted: newMuted, deafened: newDeafened } : u),
        };
      });
      return newMuted;
    });
  }, [socket, user?.id, isDeafened, isMuted, notify, acquireMicStream, startSpeakingDetection, renegotiateAllPeerConnections]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened(prev => {
      const newDeafened = !prev;
      Object.values(remoteAudioRefs.current).forEach(a => { a.muted = newDeafened; });

      let newMuted = isMuted;
      if (newDeafened && !isMuted) {
        newMuted = true;
        setIsMuted(true);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
        if (processedStreamRef.current) {
          processedStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
      } else if (!newDeafened && isMuted) {
        newMuted = false;
        setIsMuted(false);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
        }
        if (processedStreamRef.current) {
          processedStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
        }
      }

      if (socket) {
        if (voiceChannelIdRef.current) {
          socket.emit('voice_state', {
            channelId: voiceChannelIdRef.current,
            muted: newMuted,
            deafened: newDeafened,
          });
        } else if (voiceConversationIdRef.current) {
          socket.emit('voice_state_dm', {
            conversationId: voiceConversationIdRef.current,
            muted: newMuted,
            deafened: newDeafened,
          });
        }
      }
      setVoiceUsers(prev2 => {
        const chId = voiceChannelIdRef.current || (voiceConversationIdRef.current ? `dm_${voiceConversationIdRef.current}` : null);
        if (!chId || !prev2[chId]) return prev2;
        return {
          ...prev2,
          [chId]: prev2[chId].map(u => sameUserId(u.id, user?.id) ? { ...u, muted: newMuted, deafened: newDeafened } : u),
        };
      });
      return newDeafened;
    });
  }, [socket, user?.id, isMuted]);

  // Keep tray action refs in sync
  useEffect(() => {
    trayActionsRef.current = { toggleMute, leaveVoice, leaveVoiceDM };
  }, [toggleMute, leaveVoice, leaveVoiceDM]);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.error('Screen sharing not supported');
      return;
    }
    try {
      if (window.electron?.getDesktopSources) {
        const sources = await window.electron.getDesktopSources();
        const sourceId = await new Promise((resolve) => {
          screenShareResolveRef.current = resolve;
          setScreenSharePicker({ visible: true, sources });
        });
        if (!sourceId) return;
        await window.electron.setDesktopSource(sourceId);
      }
      const hasNitro = !!user?.has_nitro;
      const rawStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          width: hasNitro
            ? { ideal: 1920, max: 3840 }
            : { ideal: 1280, max: 1920 },
          height: hasNitro
            ? { ideal: 1080, max: 2160 }
            : { ideal: 720, max: 1080 },
          frameRate: hasNitro
            ? { ideal: 60, max: 60 }
            : { ideal: 30, max: 30 },
        },
        // Electron (Windows): loopback system audio with the chosen window; browser: tab/screen audio when offered.
        audio: true,
      });
      applyScreenShareTrackHints(rawStream);
      rawStream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShare());
      try {
        await prepareDisplayCaptureForSend(rawStream);
      } catch (e) {
        console.warn('Screen share audio processing failed:', e);
        screenShareRawStreamRef.current = rawStream;
        screenStreamRef.current = rawStream;
        const vt = rawStream.getVideoTracks()[0];
        setOwnScreenStream(vt ? new MediaStream([vt]) : null);
        setScreenShareCaptureAudioActive(false);
      }

      const stream = screenStreamRef.current;
      if (!stream) return;

      setIsScreenSharing(true);
      if (socket && voiceChannelIdRef.current) {
        socket.emit('voice_screen_sharing', { channelId: voiceChannelIdRef.current, sharing: true });
      }

      const peerIds = Object.keys(peerConnectionsRef.current);
      if (peerIds.length === 0) {
        if (hasNitro && !localStorage.getItem(NITRO_STREAM_SEEN_KEY)) {
          localStorage.setItem(NITRO_STREAM_SEEN_KEY, '1');
          setNitroCelebration(true);
        }
        return;
      }

      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (!pc || pc.signalingState === 'closed') continue;
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }
      await renegotiateAllPeerConnections();

      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (pc && pc.signalingState !== 'closed') {
          configureVideoSender(pc, hasNitro);
          configureAudioSender(pc);
        }
      }

      if (hasNitro && !localStorage.getItem(NITRO_STREAM_SEEN_KEY)) {
        localStorage.setItem(NITRO_STREAM_SEEN_KEY, '1');
        setNitroCelebration(true);
      }
    } catch (err) {
      console.error('Screen share failed:', err);
    }
  }, [renegotiateAllPeerConnections, user?.has_nitro, prepareDisplayCaptureForSend]);

  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current && !screenShareRawStreamRef.current) return;
    const sendStream = screenStreamRef.current;
    const tracks = sendStream ? [...sendStream.getTracks()] : [];

    const peerIds = Object.keys(peerConnectionsRef.current);
    for (const targetUserId of peerIds) {
      const pc = peerConnectionsRef.current[targetUserId];
      if (!pc) continue;
      for (const sender of [...pc.getSenders()]) {
        if (sender.track && tracks.includes(sender.track)) {
          pc.removeTrack(sender);
        }
      }
    }
    await renegotiateAllPeerConnections();

    teardownLocalScreenCapture();

    setIsScreenSharing(false);
    if (socket && voiceChannelIdRef.current) {
      socket.emit('voice_screen_sharing', { channelId: voiceChannelIdRef.current, sharing: false });
    }
  }, [renegotiateAllPeerConnections, socket, teardownLocalScreenCapture]);

  const getVideoConstraints = useCallback((deviceId) => {
    const nitro = hasNitroRef.current;
    const base = nitro
      ? {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, max: 60 },
        }
      : {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        };
    if (deviceId && deviceId !== 'default') {
      return { ...base, deviceId: { exact: deviceId } };
    }
    return { ...base, facingMode: 'user' };
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const videoDevice = settings?.video_device;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(videoDevice),
        audio: false,
      });
      cameraStreamRef.current = stream;
      setOwnCameraStream(stream);
      setIsCameraOn(true);
      
      if (socket && voiceConversationIdRef.current) {
        socket.emit('voice_video_dm', { conversationId: voiceConversationIdRef.current, enabled: true });
      }

      const peerIds = Object.keys(peerConnectionsRef.current);
      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (!pc || pc.signalingState === 'closed') continue;
        pc.addTrack(stream.getVideoTracks()[0], stream);
      }
      await renegotiateAllPeerConnections();
      const nitro = hasNitroRef.current;
      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (pc && pc.signalingState !== 'closed') configureVideoSender(pc, nitro);
      }
    } catch (err) {
      console.error('Camera start failed:', err);
    }
  }, [socket, renegotiateAllPeerConnections, settings?.video_device, getVideoConstraints, user?.has_nitro]);

  const stopCamera = useCallback(async () => {
    if (!cameraStreamRef.current) return;
    cameraStreamRef.current.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    setOwnCameraStream(null);
    setIsCameraOn(false);
    
    if (socket && voiceConversationIdRef.current) {
      socket.emit('voice_video_dm', { conversationId: voiceConversationIdRef.current, enabled: false });
    }

    const peerIds = Object.keys(peerConnectionsRef.current);
    for (const targetUserId of peerIds) {
      const pc = peerConnectionsRef.current[targetUserId];
      if (!pc) continue;
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) pc.removeTrack(sender);
    }
    await renegotiateAllPeerConnections();
  }, [socket, renegotiateAllPeerConnections]);

  const startScreenShareDM = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) return;
    try {
      if (window.electron?.getDesktopSources) {
        const sources = await window.electron.getDesktopSources();
        const sourceId = await new Promise((resolve) => {
          screenShareResolveRef.current = resolve;
          setScreenSharePicker({ visible: true, sources });
        });
        if (!sourceId) return;
        await window.electron.setDesktopSource(sourceId);
      }
      const hasNitro = !!user?.has_nitro;
      const rawStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          width: hasNitro
            ? { ideal: 1920, max: 3840 }
            : { ideal: 1280, max: 1920 },
          height: hasNitro
            ? { ideal: 1080, max: 2160 }
            : { ideal: 720, max: 1080 },
          frameRate: hasNitro
            ? { ideal: 60, max: 60 }
            : { ideal: 30, max: 30 },
        },
        audio: true,
      });
      applyScreenShareTrackHints(rawStream);
      rawStream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShareDM());
      try {
        await prepareDisplayCaptureForSend(rawStream);
      } catch (e) {
        console.warn('DM screen share audio processing failed:', e);
        screenShareRawStreamRef.current = rawStream;
        screenStreamRef.current = rawStream;
        const vt = rawStream.getVideoTracks()[0];
        setOwnScreenStream(vt ? new MediaStream([vt]) : null);
        setScreenShareCaptureAudioActive(false);
      }

      const stream = screenStreamRef.current;
      if (!stream) return;

      setIsScreenSharing(true);

      if (socket && voiceConversationIdRef.current) {
        socket.emit('voice_screen_sharing_dm', { conversationId: voiceConversationIdRef.current, sharing: true });
      }

      const peerIds = Object.keys(peerConnectionsRef.current);
      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (!pc || pc.signalingState === 'closed') continue;
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }
      await renegotiateAllPeerConnections();

      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (pc && pc.signalingState !== 'closed') {
          configureVideoSender(pc, hasNitro);
          configureAudioSender(pc);
        }
      }

      if (hasNitro && !localStorage.getItem(NITRO_STREAM_SEEN_KEY)) {
        localStorage.setItem(NITRO_STREAM_SEEN_KEY, '1');
        setNitroCelebration(true);
      }
    } catch (err) {
      console.error('DM Screen share failed:', err);
    }
  }, [socket, renegotiateAllPeerConnections, user?.has_nitro, prepareDisplayCaptureForSend]);

  const stopScreenShareDM = useCallback(async () => {
    if (!screenStreamRef.current && !screenShareRawStreamRef.current) return;
    const sendStream = screenStreamRef.current;
    const tracks = sendStream ? [...sendStream.getTracks()] : [];

    const peerIds = Object.keys(peerConnectionsRef.current);
    for (const targetUserId of peerIds) {
      const pc = peerConnectionsRef.current[targetUserId];
      if (!pc) continue;
      for (const sender of [...pc.getSenders()]) {
        if (sender.track && tracks.includes(sender.track)) {
          pc.removeTrack(sender);
        }
      }
    }
    await renegotiateAllPeerConnections();

    teardownLocalScreenCapture();

    setIsScreenSharing(false);

    if (socket && voiceConversationIdRef.current) {
      socket.emit('voice_screen_sharing_dm', { conversationId: voiceConversationIdRef.current, sharing: false });
    }
  }, [socket, renegotiateAllPeerConnections, teardownLocalScreenCapture]);

  const switchAudioInput = useCallback(async (deviceId) => {
    if (!localStreamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    updateSetting?.('input_device', deviceId || 'default');

    // Immediately clear speaking state while mic is switching
    wasSpeakingRef.current = false;
    setSpeakingUsers(prev => {
      const sk = speakingKey(user?.id);
      if (!sk || !prev.has(sk)) return prev;
      const next = new Set(prev);
      next.delete(sk);
      return next;
    });
    if (socket) {
      if (voiceChannelIdRef.current) {
        socket.emit('voice_speaking', { channelId: voiceChannelIdRef.current, speaking: false });
      } else if (voiceConversationIdRef.current) {
        socket.emit('voice_speaking_dm', { conversationId: voiceConversationIdRef.current, speaking: false });
      }
    }

    const constraints = {
      audio: {
        deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
        echoCancellation: settings?.echo_cancellation ?? true,
        noiseSuppression: settings?.noise_suppression ?? true,
        autoGainControl: settings?.auto_gain_control ?? true,
      },
    };
    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints).catch(() =>
        navigator.mediaDevices.getUserMedia({ audio: true })
      );
      if (!newStream.getAudioTracks()[0]) return;
      localStreamRef.current.getAudioTracks().forEach(t => t.stop());
      localStreamRef.current = newStream;
      stopSpeakingDetection();
      await startSpeakingDetection(newStream);
      const processedTrack = processedStreamRef.current?.getAudioTracks()?.[0];
      if (processedTrack) {
        const peerIds = Object.keys(peerConnectionsRef.current);
        for (const targetUserId of peerIds) {
          const pc = peerConnectionsRef.current[targetUserId];
          if (!pc) continue;
          const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
          if (sender) await sender.replaceTrack(processedTrack);
        }
      }
    } catch (err) {
      console.warn('switchAudioInput failed:', err);
    }
  }, [settings, updateSetting, startSpeakingDetection, stopSpeakingDetection, socket, user?.id]);

  const switchAudioOutput = useCallback((deviceId) => {
    updateSetting?.('output_device', deviceId || 'default');
    Object.values(remoteAudioRefs.current).forEach(audio => {
      if (audio?.setSinkId) {
        audio.setSinkId(deviceId && deviceId !== 'default' ? deviceId : 'default').catch(() => {});
      }
    });
  }, [updateSetting]);

  const switchVideoInput = useCallback(async (deviceId) => {
    updateSetting?.('video_device', deviceId || 'default');
    if (!cameraStreamRef.current) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(deviceId),
        audio: false,
      }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = newStream;
      setOwnCameraStream(newStream);
      const peerIds = Object.keys(peerConnectionsRef.current);
      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (!pc) continue;
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }
    } catch (err) {
      console.warn('switchVideoInput failed:', err);
    }
  }, [updateSetting, getVideoConstraints]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const cleanupPeersForLogicalUserId = (logicalUserId) => {
      for (const key of Object.keys(peerConnectionsRef.current)) {
        const { userId: pkUid } = parsePeerKey(key);
        if (sameUserId(pkUid, logicalUserId)) cleanupPeerConnection(key);
      }
    };

    const syncPeersFromEndpointRows = (rows) => {
      const hasEp = (rows || []).some((r) => r.voice_client_id);
      if (!hasEp) return;
      const desired = new Set();
      for (const u of rows || []) {
        if (u.voice_client_id == null) continue;
        if (sameUserId(u.id, user?.id) && u.voice_client_id === myVoiceClientIdRef.current) continue;
        desired.add(peerKey(u.id, u.voice_client_id));
      }
      for (const key of Object.keys(peerConnectionsRef.current)) {
        if (!desired.has(key)) cleanupPeerConnection(key);
      }
    };

    const onVoiceUsers = ({ channelId, users, teamId, channelName, teamName }) => {
      const deduped = dedupeVoiceParticipantsByUserId(users);
      const merged = deduped.map(u =>
        sameUserId(u.id, user?.id) ? { ...u, muted: isMutedRef.current, deafened: isDeafenedRef.current } : u
      );
      setVoiceUsers(prev => ({ ...prev, [channelId]: merged }));
      if (teamId != null && (channelName || teamName)) {
        setVoiceChannelMeta(prev => ({
          ...prev,
          [channelId]: { channelName: channelName || 'Voice', teamName: teamName || 'Server', teamId },
        }));
      }
      if (voiceChannelIdRef.current === channelId) {
        syncPeersFromEndpointRows(users);
      }
    };

    const onVoiceUserJoined = ({ channelId, user: joinedUser, teamId, channelName, teamName }) => {
      setVoiceUsers(prev => {
        const existing = prev[channelId] || [];
        if (existing.some(u => sameUserId(u.id, joinedUser.id))) return prev;
        return { ...prev, [channelId]: [...existing, joinedUser] };
      });
      if (teamId != null && (channelName || teamName)) {
        setVoiceChannelMeta(prev => ({
          ...prev,
          [channelId]: { channelName: channelName || 'Voice', teamName: teamName || 'Server', teamId },
        }));
      }
    };

    const onVoiceEndpointJoined = ({ channelId, user: ju }) => {
      if (voiceChannelIdRef.current !== channelId) return;
      const vc = ju?.voice_client_id;
      if (vc == null) return;
      if (sameUserId(ju.id, user?.id) && vc === myVoiceClientIdRef.current) return;
      createPeerConnection(ju.id, vc, true);
    };

    const onVoiceEndpointLeft = ({ channelId, userId, voice_client_id }) => {
      if (voiceChannelIdRef.current !== channelId) return;
      if (voice_client_id) cleanupPeerConnection(peerKey(userId, voice_client_id));
    };

    const onVoiceUserLeft = ({ channelId, userId }) => {
      setVoiceUsers(prev => {
        const existing = prev[channelId] || [];
        const filtered = existing.filter(u => !sameUserId(u.id, userId));
        if (filtered.length === 0) {
          setVoiceChannelMeta(m => {
            const next = { ...m };
            delete next[channelId];
            return next;
          });
          const next = { ...prev };
          delete next[channelId];
          return next;
        }
        return { ...prev, [channelId]: filtered };
      });
      setScreenSharingUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      cleanupPeersForLogicalUserId(userId);
      setSpeakingUsers(prev => {
        const sk = speakingKey(userId);
        if (!sk || !prev.has(sk)) return prev;
        const next = new Set(prev);
        next.delete(sk);
        return next;
      });
    };

    const onVoiceStateUpdate = ({ channelId, userId, muted, deafened }) => {
      setVoiceUsers(prev => {
        if (!prev[channelId]) return prev;
        return {
          ...prev,
          [channelId]: prev[channelId].map(u =>
            sameUserId(u.id, userId) ? { ...u, muted, deafened } : u
          ),
        };
      });
    };

    const onVoiceSpeaking = ({ channelId, userId, speaking }) => {
      if (sameUserId(userId, user?.id)) return;
      const sk = speakingKey(userId);
      if (!sk) return;
      setSpeakingUsers(prev => {
        if (speaking && prev.has(sk)) return prev;
        if (!speaking && !prev.has(sk)) return prev;
        const next = new Set(prev);
        if (speaking) next.add(sk);
        else next.delete(sk);
        return next;
      });
    };

    const onVoiceScreenSharing = ({ channelId, userId, sharing }) => {
      if (voiceChannelIdRef.current !== channelId) return;
      setScreenSharingUserIds(prev => {
        const next = new Set(prev);
        if (sharing) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };

    const dmKey = (convId) => `dm_${convId}`;

    const makeSelfDmRosterRow = () => {
      if (!user?.id) return null;
      return {
        id: user.id,
        display_name: user.display_name ?? 'User',
        avatar_url: user.avatar_url ?? null,
        muted: isMutedRef.current,
        deafened: isDeafenedRef.current,
      };
    };

    const onVoiceUsersDm = ({ conversationId, users }) => {
      let deduped = dedupeVoiceParticipantsByUserId(users);
      const stillInThisDm =
        voiceConversationIdRef.current != null &&
        Number(voiceConversationIdRef.current) === Number(conversationId);
      if (deduped.length === 0 && stillInThisDm && user?.id) {
        const row = makeSelfDmRosterRow();
        if (row) deduped = [row];
      }
      const merged = deduped.map(u =>
        sameUserId(u.id, user?.id) ? { ...u, muted: isMutedRef.current, deafened: isDeafenedRef.current } : u
      );
      setVoiceUsers(prev => ({ ...prev, [dmKey(conversationId)]: merged }));
      if (voiceConversationIdRef.current === conversationId) {
        syncPeersFromEndpointRows(users);
      }
    };

    const onVoiceUserJoinedDm = ({ conversationId, user: joinedUser }) => {
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        const existing = prev[key] || [];
        if (existing.some(u => sameUserId(u.id, joinedUser.id))) return prev;
        return { ...prev, [key]: [...existing, joinedUser] };
      });
    };

    const onVoiceEndpointJoinedDm = ({ conversationId, user: ju }) => {
      if (voiceConversationIdRef.current !== conversationId) return;
      const vc = ju?.voice_client_id;
      if (vc == null) return;
      if (sameUserId(ju.id, user?.id) && vc === myVoiceClientIdRef.current) return;
      // DM 1:1: only the lower user id sends the offer; the other waits — avoids offer/offer glare.
      const shouldInitiateOffer = isPoliteGlarePeer(user?.id, ju.id);
      createPeerConnection(ju.id, vc, shouldInitiateOffer);
    };

    const onVoiceEndpointLeftDm = ({ conversationId, userId, voice_client_id }) => {
      if (voiceConversationIdRef.current !== conversationId) return;
      if (voice_client_id) cleanupPeerConnection(peerKey(userId, voice_client_id));
    };

    const onVoiceCallIncoming = ({ conversationId, caller }) => {
      if (hasDeclinedDmConv(conversationId)) return;
      setIncomingCall({ conversationId, caller: caller || {} });
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        const existing = prev[key] || [];
        if (caller?.id && existing.some(u => sameUserId(u.id, caller.id))) return prev;
        return { ...prev, [key]: caller?.id ? [...existing.filter(u => !sameUserId(u.id, caller.id)), caller] : existing };
      });
    };

    const onVoiceDmCallState = ({ conversationId, users, callerId }) => {
      const stillInThisDm =
        voiceConversationIdRef.current != null &&
        Number(voiceConversationIdRef.current) === Number(conversationId);
      const rawUsers = users || [];
      if (!stillInThisDm && rawUsers.length === 0) {
        removeDeclinedDmConv(conversationId);
      }

      const key = dmKey(conversationId);
      let list = rawUsers;
      if (list.length === 0 && stillInThisDm && user?.id) {
        const row = makeSelfDmRosterRow();
        if (row) list = [row];
      }
      setVoiceUsers(prev => ({ ...prev, [key]: list }));
      if (stillInThisDm) {
        setDmCallCallerId(callerId != null ? Number(callerId) : null);
      }
      const imInRoster = list.some(u => sameUserId(u.id, user?.id));
      const inThisCallUi = Number(voiceConversationIdRef.current) === Number(conversationId);
      if (!list.length || imInRoster || inThisCallUi) {
        setIncomingCall(prev => (prev?.conversationId === conversationId ? null : prev));
        return;
      }
      if (hasDeclinedDmConv(conversationId)) {
        setIncomingCall(prev => (prev?.conversationId === conversationId ? null : prev));
        return;
      }
      // Do not set incomingCall from passive roster sync (e.g. peer left, caller still alone) —
      // that spuriously rings and shows OS notifications. Incoming UI only comes from voice_call_incoming.
    };

    const onVoiceUserLeftDm = ({ conversationId, userId }) => {
      setIncomingCall(prev => (prev?.conversationId === conversationId && sameUserId(prev?.caller?.id, userId) ? null : prev));
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        const existing = prev[key] || [];
        const filtered = existing.filter(u => !sameUserId(u.id, userId));
        const stillInThisDm =
          voiceConversationIdRef.current != null &&
          Number(voiceConversationIdRef.current) === Number(conversationId);
        let nextList = filtered;
        if (nextList.length === 0 && stillInThisDm && user?.id) {
          const row = makeSelfDmRosterRow();
          if (row) nextList = [row];
        }
        if (nextList.length === 0) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: nextList };
      });
      cleanupPeersForLogicalUserId(userId);
      setSpeakingUsers(prev => {
        const sk = speakingKey(userId);
        if (!sk || !prev.has(sk)) return prev;
        const next = new Set(prev);
        next.delete(sk);
        return next;
      });
    };

    const onVoiceStateUpdateDm = ({ conversationId, userId, muted, deafened }) => {
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        if (!prev[key]) return prev;
        return {
          ...prev,
          [key]: prev[key].map(u =>
            sameUserId(u.id, userId) ? { ...u, muted, deafened } : u
          ),
        };
      });
    };

    const onVoiceSpeakingDm = ({ conversationId, userId, speaking }) => {
      if (sameUserId(userId, user?.id)) return;
      const sk = speakingKey(userId);
      if (!sk) return;
      setSpeakingUsers(prev => {
        if (speaking && prev.has(sk)) return prev;
        if (!speaking && !prev.has(sk)) return prev;
        const next = new Set(prev);
        if (speaking) next.add(sk);
        else next.delete(sk);
        return next;
      });
    };

    const onVoiceScreenSharingDm = ({ conversationId, userId, sharing }) => {
      if (voiceConversationIdRef.current !== conversationId) return;
      setScreenSharingUserIds(prev => {
        const next = new Set(prev);
        if (sharing) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };

    const onVoiceVideoDm = ({ conversationId, userId, enabled }) => {
      if (voiceConversationIdRef.current !== conversationId) return;
      setVideoEnabledUserIds(prev => {
        const next = new Set(prev);
        if (enabled) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };

    const onVoiceCallDeclined = () => {
      // Callee declined — caller stays in the call alone (do not leaveVoiceDM).
    };

    const drainIceQueue = async (peerKeyStr) => {
      const queue = iceCandidateQueueRef.current[peerKeyStr] || [];
      delete iceCandidateQueueRef.current[peerKeyStr];
      const pc = peerConnectionsRef.current[peerKeyStr];
      if (!pc) return;
      for (const cand of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('ICE candidate add failed:', e);
        }
      }
    };

    const onVoiceSignal = async ({ fromUserId, fromVoiceClientId, signal }) => {
      try {
        if (!fromVoiceClientId) return;
        const pk = peerKey(fromUserId, fromVoiceClientId);
        if (signal.type === 'offer') {
          let pc = peerConnectionsRef.current[pk];
          const needNewPc = !pc || pc.signalingState === 'closed' || pc.connectionState === 'closed';
          if (needNewPc) pc = createPeerConnection(fromUserId, fromVoiceClientId, false);
          if (!pc) return;

          if (pc.signalingState === 'have-local-offer') {
            try {
              await pc.setLocalDescription({ type: 'rollback' });
            } catch (rollbackErr) {
              console.warn('WebRTC glare rollback failed:', rollbackErr);
              return;
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await drainIceQueue(pk);
          const answer = await pc.createAnswer();
          answer.sdp = setOpusAttributes(answer.sdp);
          await pc.setLocalDescription(answer);
          emitVoiceSignal(fromUserId, fromVoiceClientId, { type: 'answer', sdp: pc.localDescription });
        } else if (signal.type === 'answer') {
          const pc = peerConnectionsRef.current[pk];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await drainIceQueue(pk);
          }
        } else if (signal.type === 'candidate') {
          const pc = peerConnectionsRef.current[pk];
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => console.warn('ICE add failed:', e));
          } else {
            if (!iceCandidateQueueRef.current[pk]) iceCandidateQueueRef.current[pk] = [];
            iceCandidateQueueRef.current[pk].push(signal.candidate);
          }
        }
      } catch (err) {
        console.error('Signal handling error:', err);
      }
    };

    socket.on('voice_users', onVoiceUsers);
    socket.on('voice_user_joined', onVoiceUserJoined);
    socket.on('voice_endpoint_joined', onVoiceEndpointJoined);
    socket.on('voice_endpoint_left', onVoiceEndpointLeft);
    socket.on('voice_user_left', onVoiceUserLeft);
    socket.on('voice_state_update', onVoiceStateUpdate);
    socket.on('voice_speaking', onVoiceSpeaking);
    socket.on('voice_screen_sharing', onVoiceScreenSharing);
    socket.on('voice_users_dm', onVoiceUsersDm);
    socket.on('voice_user_joined_dm', onVoiceUserJoinedDm);
    socket.on('voice_endpoint_joined_dm', onVoiceEndpointJoinedDm);
    socket.on('voice_endpoint_left_dm', onVoiceEndpointLeftDm);
    socket.on('voice_call_incoming', onVoiceCallIncoming);
    socket.on('voice_dm_call_state', onVoiceDmCallState);
    socket.on('voice_user_left_dm', onVoiceUserLeftDm);
    socket.on('voice_state_update_dm', onVoiceStateUpdateDm);
    socket.on('voice_speaking_dm', onVoiceSpeakingDm);
    socket.on('voice_screen_sharing_dm', onVoiceScreenSharingDm);
    socket.on('voice_video_dm', onVoiceVideoDm);
    socket.on('voice_call_declined', onVoiceCallDeclined);
    socket.on('voice_signal', onVoiceSignal);

    const onVoiceCallEndedTimeLimit = ({ conversationId: cId }) => {
      if (voiceConversationIdRef.current === cId) {
        leaveVoiceDM();
      }
    };
    socket.on('voice_call_ended_time_limit', onVoiceCallEndedTimeLimit);

    const onVoiceRingSent = () => setRingAgainTrigger(t => t + 1);
    socket.on('voice_ring_sent', onVoiceRingSent);

    const onDmCallEnded = ({ conversationId: cId }) => {
      const id = coercePositiveInt(cId) ?? (Number.isFinite(Number(cId)) ? Number(cId) : null);
      if (id != null) removeDeclinedDmConv(id);
    };
    socket.on('dm_call_ended', onDmCallEnded);

    return () => {
      socket.off('voice_users', onVoiceUsers);
      socket.off('voice_user_joined', onVoiceUserJoined);
      socket.off('voice_endpoint_joined', onVoiceEndpointJoined);
      socket.off('voice_endpoint_left', onVoiceEndpointLeft);
      socket.off('voice_user_left', onVoiceUserLeft);
      socket.off('voice_state_update', onVoiceStateUpdate);
      socket.off('voice_speaking', onVoiceSpeaking);
      socket.off('voice_screen_sharing', onVoiceScreenSharing);
      socket.off('voice_users_dm', onVoiceUsersDm);
      socket.off('voice_user_joined_dm', onVoiceUserJoinedDm);
      socket.off('voice_endpoint_joined_dm', onVoiceEndpointJoinedDm);
      socket.off('voice_endpoint_left_dm', onVoiceEndpointLeftDm);
      socket.off('voice_call_incoming', onVoiceCallIncoming);
      socket.off('voice_dm_call_state', onVoiceDmCallState);
      socket.off('voice_user_left_dm', onVoiceUserLeftDm);
      socket.off('voice_state_update_dm', onVoiceStateUpdateDm);
      socket.off('voice_speaking_dm', onVoiceSpeakingDm);
      socket.off('voice_screen_sharing_dm', onVoiceScreenSharingDm);
      socket.off('voice_video_dm', onVoiceVideoDm);
      socket.off('voice_call_declined', onVoiceCallDeclined);
      socket.off('voice_signal', onVoiceSignal);
      socket.off('voice_call_ended_time_limit', onVoiceCallEndedTimeLimit);
      socket.off('voice_ring_sent', onVoiceRingSent);
      socket.off('dm_call_ended', onDmCallEnded);
    };
  }, [socket, user?.id, createPeerConnection, cleanupPeerConnection, leaveVoiceDM, emitVoiceSignal, hasDeclinedDmConv, removeDeclinedDmConv]);

  // In Electron: stay in voice when minimized to tray, only leave on real quit.
  // In browser: leave voice after 2 minutes hidden (long absence / tab forgotten).
  // When returning from being away, pre-warm AudioContext so subsequent joins are instant.
  const LEAVE_AFTER_HIDDEN_MS = 120_000;
  useEffect(() => {
    let timeoutId = null;
    const isElectron = !!window.electron;

    const handleVisibilityChange = () => {
      if (isElectron) return;
      if (document.hidden) {
        const inVoice = voiceChannelIdRef.current || voiceConversationIdRef.current;
        if (inVoice) {
          timeoutId = setTimeout(() => {
            if (voiceChannelIdRef.current) leaveVoice();
            else if (voiceConversationIdRef.current) leaveVoiceDM();
          }, LEAVE_AFTER_HIDDEN_MS);
        }
      } else {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        // Pre-warm: resume any suspended AudioContext so next join is fast
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
        // Ensure socket is reconnecting if it dropped while away
        if (socket && !socket.connected && socket.disconnected) {
          socket.connect();
        }
      }
    };

    const handleBeforeUnload = () => {
      if (voiceChannelIdRef.current) leaveVoice();
      else if (voiceConversationIdRef.current) leaveVoiceDM();
    };

    const handlePageHide = () => {
      if (voiceChannelIdRef.current) leaveVoice();
      else if (voiceConversationIdRef.current) leaveVoiceDM();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [leaveVoice, leaveVoiceDM, socket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAllConnections();
    };
  }, []);

  const value = useMemo(() => ({
    voiceChannelId,
    voiceTeamId,
    voiceChannelName,
    voiceConversationId,
    voiceConversationName,
    dmCallCallerId,
    incomingCall,
    dismissIncomingCall,
    rejectIncomingCall,
    voiceUsers,
    voiceChannelMeta,
    isMuted,
    isDeafened,
    speakingUsers,
    connectionState,
    dmRemoteMediaReady,
    isScreenSharing,
    isCameraOn,
    ownScreenStream,
    ownCameraStream,
    screenSharingUserIds,
    videoEnabledUserIds,
    remoteVideoStreams,
    expandedLiveView,
    setExpandedLiveView,
    voiceViewMinimized,
    setVoiceViewMinimized,
    dmFloatingPanelCollapsed,
    setDmFloatingPanelCollapsed,
    joinVoice,
    leaveVoice,
    joinVoiceDM,
    leaveVoiceDM,
    ringVoiceDM,
    ringAgainTrigger,
    toggleMute,
    toggleDeafen,
    startScreenShare,
    stopScreenShare,
    startScreenShareDM,
    stopScreenShareDM,
    startCamera,
    stopCamera,
    switchAudioInput,
    switchAudioOutput,
    switchVideoInput,
    screenSharePicker,
    resolveScreenSharePicker,
    screenShareCaptureAudioActive,
    setScreenShareCaptureVolume,
    streamVolumeByUserId,
    setStreamVolumeForUser,
    getStreamVolumePercent,
    getListenVolume01,
  }), [
    voiceChannelId, voiceTeamId, voiceChannelName,
    voiceConversationId, voiceConversationName, dmCallCallerId,
    incomingCall, dismissIncomingCall, rejectIncomingCall,
    voiceUsers, voiceChannelMeta, isMuted, isDeafened, speakingUsers, connectionState, dmRemoteMediaReady,
    isScreenSharing, isCameraOn, ownScreenStream, ownCameraStream,
    screenSharingUserIds, videoEnabledUserIds, remoteVideoStreams,
    expandedLiveView, voiceViewMinimized, dmFloatingPanelCollapsed,
    joinVoice, leaveVoice, joinVoiceDM, leaveVoiceDM, ringVoiceDM, ringAgainTrigger,
    toggleMute, toggleDeafen, startScreenShare, stopScreenShare,
    startScreenShareDM, stopScreenShareDM, startCamera, stopCamera,
    switchAudioInput, switchAudioOutput, switchVideoInput,
    screenSharePicker, resolveScreenSharePicker,
    screenShareCaptureAudioActive, setScreenShareCaptureVolume,
    streamVolumeByUserId, setStreamVolumeForUser, getStreamVolumePercent, getListenVolume01,
  ]);

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {nitroCelebration && createPortal(
        <NitroStreamCelebration onDone={() => setNitroCelebration(false)} />,
        document.body
      )}
    </VoiceContext.Provider>
  );
}

function NitroStreamCelebration({ onDone }) {
  const [phase, setPhase] = useState('enter');

  useEffect(() => {
    const showTimer = setTimeout(() => setPhase('exit'), 3600);
    const doneTimer = setTimeout(onDone, 4200);
    return () => { clearTimeout(showTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div className={`nitro-stream-celebration ${phase}`} onClick={() => { setPhase('exit'); setTimeout(onDone, 500); }}>
      <div className="nsc-shimmer" />
      <div className="nsc-content">
        <div className="nsc-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#nsc-bolt)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5"/>
            <defs><linearGradient id="nsc-bolt" x1="3" y1="2" x2="21" y2="22"><stop stopColor="#f0abfc"/><stop offset="1" stopColor="#818cf8"/></linearGradient></defs>
          </svg>
        </div>
        <div className="nsc-text">
          <span className="nsc-title">Nitro Streaming</span>
          <span className="nsc-specs">1080p &bull; 90 FPS &bull; High Bitrate</span>
        </div>
      </div>
    </div>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}

export default VoiceContext;
