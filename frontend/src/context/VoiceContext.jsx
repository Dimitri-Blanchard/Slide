import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  try {
    const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
    if (!sender) return;
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

const SPEAKING_THRESHOLD = 25;
const SPEAKING_CHECK_INTERVAL = 100;

export function VoiceProvider({ children }) {
  const socket = useSocket();
  const { user } = useAuth();
  const { settings, updateSetting } = useSettings();
  const { notify } = useNotification();

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
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [ownScreenStream, setOwnScreenStream] = useState(null);
  const [ownCameraStream, setOwnCameraStream] = useState(null);
  const [screenSharingUserIds, setScreenSharingUserIds] = useState(new Set());
  const [videoEnabledUserIds, setVideoEnabledUserIds] = useState(new Set());
  const [remoteVideoStreams, setRemoteVideoStreams] = useState({});
  const [expandedLiveView, setExpandedLiveView] = useState(null);
  const [voiceViewMinimized, setVoiceViewMinimized] = useState(false);
  const [ringAgainTrigger, setRingAgainTrigger] = useState(0);
  const [screenSharePicker, setScreenSharePicker] = useState({ visible: false, sources: [] });
  const screenShareResolveRef = useRef(null);

  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const remoteAudioRefs = useRef({});
  const iceCandidateQueueRef = useRef({});
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingCheckRef = useRef(null);
  const wasSpeakingRef = useRef(false);
  const voiceChannelIdRef = useRef(null);
  const voiceConversationIdRef = useRef(null);
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);

  useEffect(() => {
    voiceChannelIdRef.current = voiceChannelId;
  }, [voiceChannelId]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    isDeafenedRef.current = isDeafened;
  }, [isMuted, isDeafened]);

  useEffect(() => {
    voiceConversationIdRef.current = voiceConversationId;
  }, [voiceConversationId]);

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
          setSpeakingUsers(prev => {
            const next = new Set(prev);
            if (isSpeaking) next.add(user?.id);
            else next.delete(user?.id);
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

  const playRemoteStream = useCallback((userId, stream) => {
    let audio = remoteAudioRefs.current[userId];
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      remoteAudioRefs.current[userId] = audio;
    }
    audio.srcObject = stream;
    audio.volume = (settings?.output_volume ?? 100) / 100;
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
  }, [settings?.output_volume, settings?.output_device]);

  const cleanupPeerConnection = useCallback((userId) => {
    delete iceCandidateQueueRef.current[userId];
    const pc = peerConnectionsRef.current[userId];
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
      delete peerConnectionsRef.current[userId];
    }
    const audio = remoteAudioRefs.current[userId];
    if (audio) {
      audio.srcObject = null;
      audio.pause();
      audio.remove();
      delete remoteAudioRefs.current[userId];
    }
    setRemoteVideoStreams(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  const createPeerConnection = useCallback((targetUserId, isInitiator) => {
    cleanupPeerConnection(targetUserId);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current[targetUserId] = pc;

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
        event.track.onended = () => {
          setRemoteVideoStreams(prev => {
            const next = { ...prev };
            delete next[targetUserId];
            return next;
          });
        };
        setRemoteVideoStreams(prev => ({ ...prev, [targetUserId]: stream }));
      } else {
        playRemoteStream(targetUserId, stream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        const cand = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
        socket.emit('voice_signal', {
          targetUserId,
          signal: { type: 'candidate', candidate: cand },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        configureAudioSender(pc);
      } else if (state === 'failed') {
        console.warn(`Peer connection to ${targetUserId} failed, attempting ICE restart`);
        pc.createOffer({ iceRestart: true })
          .then(offer => {
            offer.sdp = setOpusAttributes(offer.sdp);
            return pc.setLocalDescription(offer);
          })
          .then(() => {
            if (socket) {
              socket.emit('voice_signal', {
                targetUserId,
                signal: { type: 'offer', sdp: pc.localDescription },
              });
            }
          })
          .catch(err => console.error('ICE restart error:', err));
      } else if (state === 'disconnected') {
        console.warn(`Peer connection to ${targetUserId} disconnected, waiting for recovery...`);
      }
    };

    if (isInitiator) {
      pc.createOffer()
        .then(offer => {
          offer.sdp = setOpusAttributes(offer.sdp);
          return pc.setLocalDescription(offer);
        })
        .then(() => {
          if (socket) {
            socket.emit('voice_signal', {
              targetUserId,
              signal: { type: 'offer', sdp: pc.localDescription },
            });
          }
        })
        .catch(err => console.error('Offer creation error:', err));
    }

    return pc;
  }, [socket, cleanupPeerConnection, playRemoteStream]);

  const retryRemoteAudioPlayback = useCallback(() => {
    Object.values(remoteAudioRefs.current).forEach(a => {
      if (a.srcObject && a.paused) {
        a.play().catch(() => {});
      }
    });
  }, []);

  const cleanupAllConnections = useCallback(() => {
    Object.keys(peerConnectionsRef.current).forEach(cleanupPeerConnection);
    peerConnectionsRef.current = {};

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    setIsScreenSharing(false);
    setIsCameraOn(false);
    setOwnScreenStream(null);
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
  }, [cleanupPeerConnection, stopSpeakingDetection]);

  const joinVoice = useCallback(async (channelId, teamId, channelName) => {
    if (voiceChannelIdRef.current === channelId) return;

    // Leave any current voice (server or DM)
    if (voiceChannelIdRef.current) {
      if (socket) socket.emit('voice_leave', { channelId: voiceChannelIdRef.current });
      cleanupAllConnections();
      setVoiceUsers(prev => {
        const next = { ...prev };
        if (next[voiceChannelIdRef.current]) {
          next[voiceChannelIdRef.current] = next[voiceChannelIdRef.current].filter(u => u.id !== user?.id);
          if (next[voiceChannelIdRef.current].length === 0) delete next[voiceChannelIdRef.current];
        }
        return next;
      });
    }
    if (voiceConversationIdRef.current) {
      if (socket) socket.emit('voice_leave_dm', { conversationId: voiceConversationIdRef.current });
      cleanupAllConnections();
      const dmKey = `dm_${voiceConversationIdRef.current}`;
      setVoiceUsers(prev => {
        const next = { ...prev };
        if (next[dmKey]) {
          next[dmKey] = next[dmKey].filter(u => u.id !== user?.id);
          if (next[dmKey].length === 0) delete next[dmKey];
        }
        return next;
      });
      setVoiceConversationId(null);
      setVoiceConversationName('');
    }

    setConnectionState('connecting');
    setVoiceChannelId(channelId);
    setVoiceTeamId(teamId);
    setVoiceChannelName(channelName);
    setSpeakingUsers(new Set());

    let hasMic = false;
    try {
      const stream = await acquireMicStream();
      localStreamRef.current = stream;
      await startSpeakingDetection(stream);
      hasMic = true;
    } catch (err) {
      console.warn('No microphone available, joining as listen-only:', err?.message);
      isMutedRef.current = true;
      setIsMuted(true); // Listen-only when no mic
    }

    const selfUser = {
      id: user?.id,
      display_name: user?.display_name,
      avatar_url: user?.avatar_url,
      muted: !hasMic,
      deafened: false,
    };

    setVoiceUsers(prev => ({
      ...prev,
      [channelId]: [...(prev[channelId] || []).filter(u => u.id !== user?.id), selfUser],
    }));

    if (socket) {
      socket.emit('voice_join', { channelId, teamId });
      if (!hasMic) {
        socket.emit('voice_state', { channelId, muted: true, deafened: false });
      }
    }

    setConnectionState('connected');
    setIsDeafened(false);
    window.electron?.blockPowerSave?.();
  }, [socket, user, acquireMicStream, startSpeakingDetection, cleanupAllConnections]);

  const leaveVoice = useCallback(() => {
    if (!voiceChannelIdRef.current) return;

    const channelId = voiceChannelIdRef.current;

    if (socket) {
      socket.emit('voice_leave', { channelId });
    }

    cleanupAllConnections();

    setVoiceUsers(prev => {
      const next = { ...prev };
      if (next[channelId]) {
        next[channelId] = next[channelId].filter(u => u.id !== user?.id);
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

  const rejectIncomingCall = useCallback((conversationId) => {
    if (socket && conversationId != null) {
      const id = typeof conversationId === 'number' ? conversationId : parseInt(conversationId, 10);
      if (!Number.isNaN(id)) {
        socket.emit('voice_decline_dm', { conversationId: id });
      }
    }
    setIncomingCall(null);
  }, [socket]);

  const joinVoiceDM = useCallback(async (conversationId, otherUserName) => {
    const convId = typeof conversationId === 'number' ? conversationId : parseInt(conversationId, 10);
    if (Number.isNaN(convId)) return;
    if (voiceConversationIdRef.current === convId) return;
    setIncomingCall(prev => (prev?.conversationId === convId || prev?.conversationId === conversationId ? null : prev));

    // Leave any current voice (server or DM)
    if (voiceChannelIdRef.current) {
      if (socket) socket.emit('voice_leave', { channelId: voiceChannelIdRef.current });
      cleanupAllConnections();
      setVoiceUsers(prev => {
        const next = { ...prev };
        if (next[voiceChannelIdRef.current]) {
          next[voiceChannelIdRef.current] = next[voiceChannelIdRef.current].filter(u => u.id !== user?.id);
          if (next[voiceChannelIdRef.current].length === 0) delete next[voiceChannelIdRef.current];
        }
        return next;
      });
      setVoiceChannelId(null);
      setVoiceTeamId(null);
      setVoiceChannelName('');
    }
    if (voiceConversationIdRef.current) {
      if (socket) socket.emit('voice_leave_dm', { conversationId: voiceConversationIdRef.current });
      cleanupAllConnections();
      const dmKey = `dm_${voiceConversationIdRef.current}`;
      setVoiceUsers(prev => {
        const next = { ...prev };
        if (next[dmKey]) {
          next[dmKey] = next[dmKey].filter(u => u.id !== user?.id);
          if (next[dmKey].length === 0) delete next[dmKey];
        }
        return next;
      });
    }

    setConnectionState('connecting');
    setVoiceConversationId(convId);
    setVoiceConversationName(otherUserName || 'DM Call');

    let hasMic = false;
    try {
      const stream = await acquireMicStream();
      localStreamRef.current = stream;
      await startSpeakingDetection(stream);
      hasMic = true;
    } catch (err) {
      console.warn('No microphone available, joining DM as listen-only:', err?.message);
      isMutedRef.current = true;
      setIsMuted(true); // Listen-only when no mic
    }

    const selfUser = {
      id: user?.id,
      display_name: user?.display_name,
      avatar_url: user?.avatar_url,
      muted: !hasMic,
      deafened: false,
    };

    const dmKey = `dm_${convId}`;
    setVoiceUsers(prev => ({
      ...prev,
      [dmKey]: [...(prev[dmKey] || []).filter(u => u.id !== user?.id), selfUser],
    }));

    if (socket) {
      socket.emit('voice_join_dm', { conversationId: convId });
      if (!hasMic) {
        socket.emit('voice_state_dm', { conversationId: convId, muted: true, deafened: false });
      }
    }

    setConnectionState('connected');
    window.electron?.blockPowerSave?.();
  }, [socket, user, acquireMicStream, startSpeakingDetection, cleanupAllConnections]);

  const leaveVoiceDM = useCallback(() => {
    if (!voiceConversationIdRef.current) return;

    const conversationId = voiceConversationIdRef.current;
    const dmKey = `dm_${conversationId}`;

    if (socket) {
      socket.emit('voice_leave_dm', { conversationId });
    }

    cleanupAllConnections();

    setVoiceUsers(prev => {
      const next = { ...prev };
      if (next[dmKey]) {
        next[dmKey] = next[dmKey].filter(u => u.id !== user?.id);
        if (next[dmKey].length === 0) delete next[dmKey];
      }
      return next;
    });

    setSpeakingUsers(new Set());
    setVoiceConversationId(null);
    setVoiceConversationName('');
    setVoiceViewMinimized(false);
    setConnectionState('disconnected');
    setIsMuted(false);
    setIsDeafened(false);
    window.electron?.unblockPowerSave?.();
  }, [socket, user?.id, cleanupAllConnections]);

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
    const peerIds = Object.keys(peerConnectionsRef.current);
    for (const targetUserId of peerIds) {
      const pc = peerConnectionsRef.current[targetUserId];
      if (!pc || pc.signalingState === 'closed') continue;
      try {
        const offer = await pc.createOffer();
        offer.sdp = setOpusAttributes(offer.sdp);
        await pc.setLocalDescription(offer);
        if (socket) {
          socket.emit('voice_signal', {
            targetUserId: parseInt(targetUserId, 10),
            signal: { type: 'offer', sdp: pc.localDescription },
          });
        }
      } catch (err) {
        console.error('Renegotiation offer failed:', err);
      }
    }
  }, [socket]);

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
          notify.success('Microphone connected');
          if (socket) {
            if (voiceChannelIdRef.current) {
              socket.emit('voice_state', { channelId: voiceChannelIdRef.current, muted: false, deafened: isDeafened });
            } else if (voiceConversationIdRef.current) {
              socket.emit('voice_state_dm', { conversationId: voiceConversationIdRef.current, muted: false, deafened: isDeafened });
            }
          }
          setVoiceUsers(prev2 => {
            const chId = voiceChannelIdRef.current || (voiceConversationIdRef.current ? `dm_${voiceConversationIdRef.current}` : null);
            if (!chId || !prev2[chId]) return prev2;
            return { ...prev2, [chId]: prev2[chId].map(u => u.id === user?.id ? { ...u, muted: false } : u) };
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
          const next = new Set(p);
          next.delete(user?.id);
          return next;
        });
      }
      if (socket) {
        if (voiceChannelIdRef.current) {
          socket.emit('voice_state', {
            channelId: voiceChannelIdRef.current,
            muted: newMuted,
            deafened: isDeafened,
          });
        } else if (voiceConversationIdRef.current) {
          socket.emit('voice_state_dm', {
            conversationId: voiceConversationIdRef.current,
            muted: newMuted,
            deafened: isDeafened,
          });
        }
      }
      setVoiceUsers(prev2 => {
        const chId = voiceChannelIdRef.current || (voiceConversationIdRef.current ? `dm_${voiceConversationIdRef.current}` : null);
        if (!chId || !prev2[chId]) return prev2;
        return {
          ...prev2,
          [chId]: prev2[chId].map(u => u.id === user?.id ? { ...u, muted: newMuted } : u),
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
          [chId]: prev2[chId].map(u => u.id === user?.id ? { ...u, muted: newMuted, deafened: newDeafened } : u),
        };
      });
      return newDeafened;
    });
  }, [socket, user?.id, isMuted]);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.error('Screen sharing not supported');
      return;
    }
    try {
      // In Electron, show a custom source picker before getDisplayMedia
      if (window.electron?.getDesktopSources) {
        const sources = await window.electron.getDesktopSources();
        const sourceId = await new Promise((resolve) => {
          screenShareResolveRef.current = resolve;
          setScreenSharePicker({ visible: true, sources });
        });
        if (!sourceId) return; // user cancelled
        await window.electron.setDesktopSource(sourceId);
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShare());
      screenStreamRef.current = stream;
      setOwnScreenStream(stream);
      setIsScreenSharing(true);
      if (socket && voiceChannelIdRef.current) {
        socket.emit('voice_screen_sharing', { channelId: voiceChannelIdRef.current, sharing: true });
      }

      const peerIds = Object.keys(peerConnectionsRef.current);
      if (peerIds.length === 0) return;

      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (!pc || pc.signalingState === 'closed') continue;
        pc.addTrack(stream.getVideoTracks()[0], stream);
      }
      await renegotiateAllPeerConnections();
    } catch (err) {
      console.error('Screen share failed:', err);
    }
  }, [renegotiateAllPeerConnections]);

  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setOwnScreenStream(null);
    setIsScreenSharing(false);
    if (socket && voiceChannelIdRef.current) {
      socket.emit('voice_screen_sharing', { channelId: voiceChannelIdRef.current, sharing: false });
    }

    const peerIds = Object.keys(peerConnectionsRef.current);
    for (const targetUserId of peerIds) {
      const pc = peerConnectionsRef.current[targetUserId];
      if (!pc) continue;
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) pc.removeTrack(sender);
    }
    await renegotiateAllPeerConnections();
  }, [renegotiateAllPeerConnections, socket]);

  const getVideoConstraints = useCallback((deviceId) => {
    const base = { width: { ideal: 640 }, height: { ideal: 480 } };
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
    } catch (err) {
      console.error('Camera start failed:', err);
    }
  }, [socket, renegotiateAllPeerConnections, settings?.video_device, getVideoConstraints]);

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
      // In Electron, show a custom source picker before getDisplayMedia
      if (window.electron?.getDesktopSources) {
        const sources = await window.electron.getDesktopSources();
        const sourceId = await new Promise((resolve) => {
          screenShareResolveRef.current = resolve;
          setScreenSharePicker({ visible: true, sources });
        });
        if (!sourceId) return; // user cancelled
        await window.electron.setDesktopSource(sourceId);
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShareDM());
      screenStreamRef.current = stream;
      setOwnScreenStream(stream);
      setIsScreenSharing(true);
      
      if (socket && voiceConversationIdRef.current) {
        socket.emit('voice_screen_sharing_dm', { conversationId: voiceConversationIdRef.current, sharing: true });
      }

      const peerIds = Object.keys(peerConnectionsRef.current);
      for (const targetUserId of peerIds) {
        const pc = peerConnectionsRef.current[targetUserId];
        if (!pc || pc.signalingState === 'closed') continue;
        pc.addTrack(stream.getVideoTracks()[0], stream);
      }
      await renegotiateAllPeerConnections();
    } catch (err) {
      console.error('DM Screen share failed:', err);
    }
  }, [socket, renegotiateAllPeerConnections]);

  const stopScreenShareDM = useCallback(async () => {
    if (!screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setOwnScreenStream(null);
    setIsScreenSharing(false);
    
    if (socket && voiceConversationIdRef.current) {
      socket.emit('voice_screen_sharing_dm', { conversationId: voiceConversationIdRef.current, sharing: false });
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

  const switchAudioInput = useCallback(async (deviceId) => {
    if (!localStreamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    updateSetting?.('input_device', deviceId || 'default');
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
  }, [settings, updateSetting, startSpeakingDetection, stopSpeakingDetection]);

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

    const onVoiceUsers = ({ channelId, users, teamId, channelName, teamName }) => {
      const merged = (users || []).map(u =>
        u.id === user?.id ? { ...u, muted: isMutedRef.current, deafened: isDeafenedRef.current } : u
      );
      setVoiceUsers(prev => ({ ...prev, [channelId]: merged }));
      if (teamId != null && (channelName || teamName)) {
        setVoiceChannelMeta(prev => ({
          ...prev,
          [channelId]: { channelName: channelName || 'Voice', teamName: teamName || 'Server', teamId },
        }));
      }
      // We're the NEW joiner - existing users will get voice_user_joined and send us offers.
      // We don't create PCs here; we wait for their offers in onVoiceSignal.
    };

    const onVoiceUserJoined = ({ channelId, user: joinedUser, teamId, channelName, teamName }) => {
      setVoiceUsers(prev => {
        const existing = prev[channelId] || [];
        if (existing.some(u => u.id === joinedUser.id)) return prev;
        return { ...prev, [channelId]: [...existing, joinedUser] };
      });
      if (teamId != null && (channelName || teamName)) {
        setVoiceChannelMeta(prev => ({
          ...prev,
          [channelId]: { channelName: channelName || 'Voice', teamName: teamName || 'Server', teamId },
        }));
      }
      // We were already in the channel - we create the offer to the newcomer (isInitiator=true).
      if (voiceChannelIdRef.current === channelId && joinedUser.id !== user?.id) {
        createPeerConnection(joinedUser.id, true);
      }
    };

    const onVoiceUserLeft = ({ channelId, userId }) => {
      setVoiceUsers(prev => {
        const existing = prev[channelId] || [];
        const filtered = existing.filter(u => u.id !== userId);
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
      cleanupPeerConnection(userId);
      setSpeakingUsers(prev => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const onVoiceStateUpdate = ({ channelId, userId, muted, deafened }) => {
      setVoiceUsers(prev => {
        if (!prev[channelId]) return prev;
        return {
          ...prev,
          [channelId]: prev[channelId].map(u =>
            u.id === userId ? { ...u, muted, deafened } : u
          ),
        };
      });
    };

    const onVoiceSpeaking = ({ channelId, userId, speaking }) => {
      if (userId === user?.id) return;
      setSpeakingUsers(prev => {
        if (speaking && prev.has(userId)) return prev;
        if (!speaking && !prev.has(userId)) return prev;
        const next = new Set(prev);
        if (speaking) next.add(userId);
        else next.delete(userId);
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

    const onVoiceUsersDm = ({ conversationId, users }) => {
      const merged = (users || []).map(u =>
        u.id === user?.id ? { ...u, muted: isMutedRef.current, deafened: isDeafenedRef.current } : u
      );
      setVoiceUsers(prev => ({ ...prev, [dmKey(conversationId)]: merged }));
    };

    const onVoiceUserJoinedDm = ({ conversationId, user: joinedUser }) => {
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        const existing = prev[key] || [];
        if (existing.some(u => u.id === joinedUser.id)) return prev;
        return { ...prev, [key]: [...existing, joinedUser] };
      });
      // Only create peer connection if we're IN the call (joinedUser is someone who just joined our call)
      if (voiceConversationIdRef.current === conversationId && joinedUser.id !== user?.id) {
        createPeerConnection(joinedUser.id, true);
      }
      // Incoming call is handled by voice_call_incoming (dedicated event)
    };

    const onVoiceCallIncoming = ({ conversationId, caller }) => {
      setIncomingCall({ conversationId, caller: caller || {} });
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        const existing = prev[key] || [];
        if (caller?.id && existing.some(u => u.id === caller.id)) return prev;
        return { ...prev, [key]: caller?.id ? [...existing.filter(u => u.id !== caller.id), caller] : existing };
      });
    };

    const onVoiceDmCallState = ({ conversationId, users }) => {
      const key = dmKey(conversationId);
      setVoiceUsers(prev => ({ ...prev, [key]: users || [] }));
      // Clear incoming call: when call ended (users empty) OR when we're in the call (multi-tab: we answered in another tab)
      const shouldClear = !users || users.length === 0 || users.some(u => u.id === user?.id);
      if (shouldClear) {
        setIncomingCall(prev => (prev?.conversationId === conversationId ? null : prev));
      }
    };

    const onVoiceUserLeftDm = ({ conversationId, userId }) => {
      setIncomingCall(prev => (prev?.conversationId === conversationId && prev?.caller?.id === userId ? null : prev));
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        const existing = prev[key] || [];
        const filtered = existing.filter(u => u.id !== userId);
        if (filtered.length === 0) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: filtered };
      });
      cleanupPeerConnection(userId);
      setSpeakingUsers(prev => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
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
            u.id === userId ? { ...u, muted, deafened } : u
          ),
        };
      });
    };

    const onVoiceSpeakingDm = ({ conversationId, userId, speaking }) => {
      if (userId === user?.id) return;
      setSpeakingUsers(prev => {
        if (speaking && prev.has(userId)) return prev;
        if (!speaking && !prev.has(userId)) return prev;
        const next = new Set(prev);
        if (speaking) next.add(userId);
        else next.delete(userId);
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

    const onVoiceCallDeclined = ({ conversationId }) => {
      const convId = typeof conversationId === 'number' ? conversationId : parseInt(conversationId, 10);
      if (voiceConversationIdRef.current !== convId) return;
      // Caller: callee declined, leave the call and clean up
      leaveVoiceDM();
    };

    const drainIceQueue = async (userId) => {
      const queue = iceCandidateQueueRef.current[userId] || [];
      delete iceCandidateQueueRef.current[userId];
      const pc = peerConnectionsRef.current[userId];
      if (!pc) return;
      for (const cand of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('ICE candidate add failed:', e);
        }
      }
    };

    const onVoiceSignal = async ({ fromUserId, signal }) => {
      try {
        if (signal.type === 'offer') {
          let pc = peerConnectionsRef.current[fromUserId];
          const needNewPc = !pc || pc.signalingState === 'closed' || pc.connectionState === 'closed';
          if (needNewPc) pc = createPeerConnection(fromUserId, false);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await drainIceQueue(fromUserId);
          const answer = await pc.createAnswer();
          answer.sdp = setOpusAttributes(answer.sdp);
          await pc.setLocalDescription(answer);
          socket.emit('voice_signal', {
            targetUserId: fromUserId,
            signal: { type: 'answer', sdp: pc.localDescription },
          });
        } else if (signal.type === 'answer') {
          const pc = peerConnectionsRef.current[fromUserId];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await drainIceQueue(fromUserId);
          }
        } else if (signal.type === 'candidate') {
          const pc = peerConnectionsRef.current[fromUserId];
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => console.warn('ICE add failed:', e));
          } else {
            if (!iceCandidateQueueRef.current[fromUserId]) iceCandidateQueueRef.current[fromUserId] = [];
            iceCandidateQueueRef.current[fromUserId].push(signal.candidate);
          }
        }
      } catch (err) {
        console.error('Signal handling error:', err);
      }
    };

    socket.on('voice_users', onVoiceUsers);
    socket.on('voice_user_joined', onVoiceUserJoined);
    socket.on('voice_user_left', onVoiceUserLeft);
    socket.on('voice_state_update', onVoiceStateUpdate);
    socket.on('voice_speaking', onVoiceSpeaking);
    socket.on('voice_screen_sharing', onVoiceScreenSharing);
    socket.on('voice_users_dm', onVoiceUsersDm);
    socket.on('voice_user_joined_dm', onVoiceUserJoinedDm);
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

    return () => {
      socket.off('voice_users', onVoiceUsers);
      socket.off('voice_user_joined', onVoiceUserJoined);
      socket.off('voice_user_left', onVoiceUserLeft);
      socket.off('voice_state_update', onVoiceStateUpdate);
      socket.off('voice_speaking', onVoiceSpeaking);
      socket.off('voice_screen_sharing', onVoiceScreenSharing);
      socket.off('voice_users_dm', onVoiceUsersDm);
      socket.off('voice_user_joined_dm', onVoiceUserJoinedDm);
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
    };
  }, [socket, user?.id, createPeerConnection, cleanupPeerConnection, leaveVoiceDM]);

  // Leave call only if app has been hidden for more than 5 seconds
  const LEAVE_AFTER_HIDDEN_MS = 5000;
  useEffect(() => {
    let timeoutId = null;

    const handleVisibilityChange = () => {
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
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [leaveVoice, leaveVoiceDM]);

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
    incomingCall,
    dismissIncomingCall,
    rejectIncomingCall,
    voiceUsers,
    voiceChannelMeta,
    isMuted,
    isDeafened,
    speakingUsers,
    connectionState,
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
    retryRemoteAudioPlayback,
    switchAudioInput,
    switchAudioOutput,
    switchVideoInput,
    screenSharePicker,
    resolveScreenSharePicker,
  }), [
    voiceChannelId, voiceTeamId, voiceChannelName,
    voiceConversationId, voiceConversationName,
    incomingCall, dismissIncomingCall, rejectIncomingCall,
    voiceUsers, voiceChannelMeta, isMuted, isDeafened, speakingUsers, connectionState,
    isScreenSharing, isCameraOn, ownScreenStream, ownCameraStream,
    screenSharingUserIds, videoEnabledUserIds, remoteVideoStreams,
    expandedLiveView, voiceViewMinimized,
    joinVoice, leaveVoice, joinVoiceDM, leaveVoiceDM, ringVoiceDM, ringAgainTrigger,
    toggleMute, toggleDeafen, startScreenShare, stopScreenShare,
    startScreenShareDM, stopScreenShareDM, startCamera, stopCamera,
    retryRemoteAudioPlayback, switchAudioInput, switchAudioOutput, switchVideoInput,
    screenSharePicker, resolveScreenSharePicker,
  ]);

  return (
    <VoiceContext.Provider value={value}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}

export default VoiceContext;
