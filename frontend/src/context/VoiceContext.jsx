import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { useSounds } from './SoundContext';
import { randomUuidV4 } from '../utils/randomUuid';
import {
  isElectronVoicePrefsEnabled,
  loadElectronVoicePrefs,
  persistElectronVoiceMuteFromRefs,
  saveElectronVoiceMuteState,
} from '../utils/electronVoicePrefs';

function readInitialVoiceMuteState() {
  if (!isElectronVoicePrefsEnabled()) return { isMuted: false, isDeafened: false };
  const prefs = loadElectronVoicePrefs();
  return { isMuted: !!prefs?.isMuted, isDeafened: !!prefs?.isDeafened };
}

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

function getMicrophoneIssueFromError(err) {
  const name = err?.name || '';
  const message = err?.message || '';
  const text = `${name} ${message}`.toLowerCase();

  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) {
    return { type: 'permission-denied', label: 'Accès micro refusé' };
  }

  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(name) || text.includes('device not found')) {
    return { type: 'no-device', label: 'Aucun micro détecté' };
  }

  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(name)) {
    return { type: 'device-busy', label: 'Micro utilisé ailleurs' };
  }

  return { type: 'access-failed', label: 'Micro indisponible' };
}

function isMicrophonePermissionError(err) {
  const name = err?.name || '';
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) return true;
  const text = `${name} ${err?.message || ''} ${err?.code ?? ''}`.toLowerCase();
  return /permission|not allowed|notallowed|denied|dismissed|microphone.*denied/.test(text);
}

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
const MIC_SPEECH_ATTEMPT_RESHOW_MS = 10_000;
const MIC_SPEECH_ATTEMPT_GAP_MS = 1_500;
const MIC_SPEECH_LEVEL_MIN = 32;
const MIC_SPEECH_VOICE_RATIO_MIN = 0.42;
const MIC_SPEECH_VOICE_BAND_MIN_HZ = 300;
const MIC_SPEECH_VOICE_BAND_MAX_HZ = 3400;

/** Voice-band energy ratio — ignores steady low rumble / HVAC-style noise. */
function isLikelyHumanSpeech(analyser, dataArray, sampleRate) {
  analyser.getByteFrequencyData(dataArray);
  const binCount = dataArray.length;
  if (!binCount) return false;
  const binWidth = (sampleRate / 2) / binCount;
  let voiceBandEnergy = 0;
  let totalEnergy = 0;
  for (let i = 0; i < binCount; i++) {
    const e = dataArray[i];
    totalEnergy += e;
    const freq = i * binWidth;
    if (freq >= MIC_SPEECH_VOICE_BAND_MIN_HZ && freq <= MIC_SPEECH_VOICE_BAND_MAX_HZ) {
      voiceBandEnergy += e;
    }
  }
  if (totalEnergy < 1) return false;
  const avg = totalEnergy / binCount;
  const voiceRatio = voiceBandEnergy / totalEnergy;
  return avg >= MIC_SPEECH_LEVEL_MIN && voiceRatio >= MIC_SPEECH_VOICE_RATIO_MIN;
}

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

function dmSpeakingScopeKey(conversationId) {
  const id = coercePositiveInt(conversationId) ?? conversationId;
  return `dm_${id}`;
}

function channelSpeakingScopeKey(channelId) {
  const id = coercePositiveInt(channelId);
  return id != null ? String(id) : String(channelId);
}

/** voiceUsers roster may use numeric or string channel ids — check both for speaking. */
function channelScopeLookupKeys(channelId) {
  const canon = channelSpeakingScopeKey(channelId);
  const keys = [canon];
  if (channelId != null && String(channelId) !== canon) keys.push(String(channelId));
  return keys;
}

function cloneSpeakingByScope(prev) {
  const next = {};
  for (const k of Object.keys(prev)) {
    next[k] = new Set(prev[k]);
  }
  return next;
}

function patchSpeakingInScope(prev, scopeKey, userId, speaking) {
  if (!scopeKey) return prev;
  const sk = speakingKey(userId);
  if (!sk) return prev;
  const key = String(scopeKey);
  const bucket = prev[key];
  if (speaking) {
    if (bucket?.has(sk)) return prev;
    const next = cloneSpeakingByScope(prev);
    if (!next[key]) next[key] = new Set();
    next[key].add(sk);
    return next;
  }
  if (!bucket?.has(sk)) return prev;
  const next = cloneSpeakingByScope(prev);
  next[key].delete(sk);
  if (next[key].size === 0) delete next[key];
  return next;
}

function clearSelfFromScopes(prev, scopeKeys, selfId) {
  const sk = speakingKey(selfId);
  if (!sk) return prev;
  let next = null;
  for (const scopeKey of scopeKeys) {
    const key = String(scopeKey);
    const bucket = (next ?? prev)[key];
    if (!bucket?.has(sk)) continue;
    if (!next) next = cloneSpeakingByScope(prev);
    next[key].delete(sk);
    if (next[key].size === 0) delete next[key];
  }
  return next ?? prev;
}

function speakingSetForScope(map, scopeKey) {
  if (!scopeKey) return new Set();
  const keys =
    typeof scopeKey === 'string' && scopeKey.startsWith('dm_')
      ? [scopeKey]
      : channelScopeLookupKeys(scopeKey);
  const out = new Set();
  for (const k of keys) {
    map[k]?.forEach((id) => out.add(id));
  }
  return out;
}

function isUserSpeakingInScopeMap(map, scopeKey, userId) {
  const sk = speakingKey(userId);
  if (!sk) return false;
  const keys =
    typeof scopeKey === 'string' && scopeKey.startsWith('dm_')
      ? [scopeKey]
      : channelScopeLookupKeys(scopeKey);
  return keys.some((k) => map[k]?.has(sk));
}

function rosterUserIsSpeaking(u) {
  return !!(u?.speaking ?? u?.is_speaking ?? u?.isSpeaking);
}

function normalizeSpeakingPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { channelId: null, conversationId: null, userId: null, speaking: false };
  }
  return {
    channelId: payload.channelId ?? payload.channel_id ?? null,
    conversationId: payload.conversationId ?? payload.conversation_id ?? null,
    userId: payload.userId ?? payload.user_id ?? payload.id ?? null,
    speaking: !!(payload.speaking ?? payload.is_speaking ?? payload.isSpeaking),
  };
}

function findVoiceChannelIdForUser(voiceUsersMap, userId) {
  if (!voiceUsersMap || userId == null) return null;
  for (const [key, list] of Object.entries(voiceUsersMap)) {
    if (key.startsWith('dm_')) continue;
    if (Array.isArray(list) && list.some((u) => sameUserId(u.id, userId))) return key;
  }
  return null;
}

function patchVoiceUserSpeaking(prev, channelId, userId, speaking) {
  const keys = channelScopeLookupKeys(channelId);
  let next = prev;
  let changed = false;
  for (const key of keys) {
    const list = next[key];
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex((u) => sameUserId(u.id, userId));
    if (idx === -1) continue;
    if (!!list[idx].speaking === !!speaking) continue;
    if (!changed) {
      next = { ...prev };
      changed = true;
    }
    const updated = [...(next[key] || list)];
    updated[idx] = { ...updated[idx], speaking: !!speaking };
    next[key] = updated;
  }
  return changed ? next : prev;
}

function syncSpeakingScopeFromRoster(prevScope, channelId, users) {
  const scope = channelSpeakingScopeKey(channelId);
  let next = prevScope;
  for (const u of users || []) {
    if (u?.id == null) continue;
    next = patchSpeakingInScope(next, scope, u.id, rosterUserIsSpeaking(u));
  }
  return next;
}

/** Server voice handlers require positive integers; normalize strings/NaN from API or routes. */
export function coercePositiveInt(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

const VOICE_CLIENT_STORAGE_KEY = 'slide_voice_client_id';
const PEER_KEY_SEP = '\u0001';
/** Duration of leave UI transitions (must match voice-leave.css). */
export const VOICE_LEAVE_ANIM_MS = 520;

function getVoiceLeaveAnimMs(skipEmit, animate = true) {
  if (animate === false) return 0;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 120;
  }
  return skipEmit ? 280 : VOICE_LEAVE_ANIM_MS;
}

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
  return randomUuidV4();
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

/** voiceUsers keys vary (number vs string from socket payloads). */
function voiceChannelRosterKeys(channelId) {
  const id = coercePositiveInt(channelId);
  const keys = new Set();
  if (channelId != null && channelId !== '') keys.add(channelId);
  if (id != null) {
    keys.add(id);
    keys.add(String(id));
  }
  return [...keys];
}

function voiceDmRosterKey(conversationId) {
  const id = coercePositiveInt(conversationId);
  return id != null ? `dm_${id}` : `dm_${conversationId}`;
}

function clearChannelRoster(prev, channelId) {
  const next = { ...prev };
  for (const k of voiceChannelRosterKeys(channelId)) {
    delete next[k];
  }
  return next;
}

/** Leave voice: drop only the current user from sidebar roster — keep other participants visible. */
function removeSelfFromChannelRoster(prev, channelId, authUserId) {
  if (authUserId == null) return clearChannelRoster(prev, channelId);
  const next = { ...prev };
  for (const k of voiceChannelRosterKeys(channelId)) {
    if (!Array.isArray(next[k])) continue;
    const filtered = filterOutSelfInVoiceList(next[k], authUserId);
    if (filtered.length === 0) delete next[k];
    else next[k] = filtered;
  }
  return next;
}

function clearDmRoster(prev, conversationId) {
  const next = { ...prev };
  delete next[voiceDmRosterKey(conversationId)];
  const id = coercePositiveInt(conversationId);
  if (id != null) delete next[`dm_${String(id)}`];
  return next;
}

function removeSelfFromDmRoster(prev, conversationId, authUserId) {
  if (authUserId == null) return clearDmRoster(prev, conversationId);
  const next = { ...prev };
  for (const k of [voiceDmRosterKey(conversationId), `dm_${String(coercePositiveInt(conversationId) ?? conversationId)}`]) {
    if (!Array.isArray(next[k])) continue;
    const filtered = filterOutSelfInVoiceList(next[k], authUserId);
    if (filtered.length === 0) delete next[k];
    else next[k] = filtered;
  }
  return next;
}

function normalizePresenceChannel(entry) {
  const id = coercePositiveInt(
    typeof entry === 'object' && entry !== null
      ? (entry.channelId ?? entry.channel_id ?? entry.id)
      : entry
  );
  if (id == null) return null;
  return {
    id,
    teamId: coercePositiveInt(entry?.teamId ?? entry?.team_id),
    name: entry?.channelName ?? entry?.channel_name ?? entry?.name ?? '',
    teamName: entry?.teamName ?? entry?.team_name ?? '',
  };
}

function normalizePresenceDm(entry) {
  return coercePositiveInt(
    typeof entry === 'object' && entry !== null
      ? (entry.conversationId ?? entry.conversation_id ?? entry.id)
      : entry
  );
}

export function VoiceProvider({ children }) {
  const socket = useSocket();
  const { user } = useAuth();
  const { settings, updateSetting } = useSettings();
  const { playVoiceJoin, playVoiceLeave, playVoiceMute, playVoiceUnmute, playStreamStart, playStreamStop } = useSounds();
  const hasNitroRef = useRef(!!user?.has_nitro);
  useEffect(() => {
    hasNitroRef.current = !!user?.has_nitro;
  }, [user?.has_nitro]);

  const [voiceChannelId, setVoiceChannelId] = useState(null);
  const [voiceTeamId, setVoiceTeamId] = useState(null);
  const [voiceChannelName, setVoiceChannelName] = useState('');
  const [voiceConversationId, setVoiceConversationId] = useState(null);
  const [voiceConversationName, setVoiceConversationName] = useState('');
  /** Active leave animation: UI stays mounted until this clears. */
  const [voiceLeaveAnim, setVoiceLeaveAnim] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null); // { conversationId, caller: { id, display_name, avatar_url } }
  const [voiceUsers, setVoiceUsers] = useState({});
  const [voiceChannelMeta, setVoiceChannelMeta] = useState({}); // channelId -> { channelName, teamName, teamId }
  const initialVoiceMute = readInitialVoiceMuteState();
  const [isMuted, setIsMuted] = useState(initialVoiceMute.isMuted);
  const [isDeafened, setIsDeafened] = useState(initialVoiceMute.isDeafened);
  /** channelId or dm_<conversationId> -> Set of speaking user ids (visible even when not in that voice room). */
  const [speakingUsersByScope, setSpeakingUsersByScope] = useState({});
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
  /** Mobile minimized voice island: last focused call participant or live stream subject. */
  const [voiceMiniIslandPreview, setVoiceMiniIslandPreview] = useState(null);
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
  const [microphoneIssue, setMicrophoneIssue] = useState(null);
  const lastMicrophoneIssueRef = useRef(null);
  const serverMutedRef = useRef(false);
  const serverDeafenedRef = useRef(false);
  const micAttemptStreamRef = useRef(null);
  const micAttemptAudioContextRef = useRef(null);
  const micAttemptAnalyserRef = useRef(null);
  const micAttemptCheckRef = useRef(null);
  const micAttemptAccumMsRef = useRef(0);
  const micAttemptLastActiveAtRef = useRef(0);

  const speakingUsers = useMemo(() => {
    if (voiceChannelId != null) {
      return speakingSetForScope(speakingUsersByScope, channelSpeakingScopeKey(voiceChannelId));
    }
    if (voiceConversationId != null) {
      return speakingSetForScope(speakingUsersByScope, dmSpeakingScopeKey(voiceConversationId));
    }
    return new Set();
  }, [speakingUsersByScope, voiceChannelId, voiceConversationId]);

  const isUserSpeakingInChannel = useCallback(
    (channelId, userId) => isUserSpeakingInScopeMap(speakingUsersByScope, channelId, userId),
    [speakingUsersByScope],
  );

  useEffect(() => {
    voiceUsersRef.current = voiceUsers;
  }, [voiceUsers]);

  const stopMicSpeechAttemptMonitor = useCallback(() => {
    if (micAttemptCheckRef.current) {
      clearInterval(micAttemptCheckRef.current);
      micAttemptCheckRef.current = null;
    }
    if (micAttemptStreamRef.current) {
      micAttemptStreamRef.current.getTracks().forEach((t) => t.stop());
      micAttemptStreamRef.current = null;
    }
    if (micAttemptAudioContextRef.current) {
      micAttemptAudioContextRef.current.close().catch(() => {});
      micAttemptAudioContextRef.current = null;
    }
    micAttemptAnalyserRef.current = null;
    micAttemptAccumMsRef.current = 0;
    micAttemptLastActiveAtRef.current = 0;
  }, []);

  const clearMicrophoneIssue = useCallback(() => {
    lastMicrophoneIssueRef.current = null;
    setMicrophoneIssue(null);
    stopMicSpeechAttemptMonitor();
  }, [stopMicSpeechAttemptMonitor]);

  const showMicrophoneIssue = useCallback((err) => {
    const issue = { id: Date.now(), ...getMicrophoneIssueFromError(err) };
    lastMicrophoneIssueRef.current = issue;
    setMicrophoneIssue(issue);
    stopMicSpeechAttemptMonitor();
  }, [stopMicSpeechAttemptMonitor]);

  const dismissMicrophoneIssue = useCallback(() => {
    setMicrophoneIssue(null);
  }, []);

  const restoreMicrophoneIssue = useCallback(() => {
    const issue = lastMicrophoneIssueRef.current;
    if (!issue) return;
    setMicrophoneIssue({ ...issue, id: Date.now() });
    stopMicSpeechAttemptMonitor();
  }, [stopMicSpeechAttemptMonitor]);

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
  const remoteVoiceAudioRefs = useRef({});
  const remoteCaptureAudioRefs = useRef({});
  /** Mic stream per peer (WebRTC stream id of first remote audio track). */
  const remotePeerVoiceStreamIdRef = useRef({});
  /** One MediaStream per remote peer — mic only. */
  const remoteVoiceAudioStreamsRef = useRef({});
  /** Screen/tab capture audio mixed per peer (volume slider applies here). */
  const remoteCaptureAudioStreamsRef = useRef({});
  const iceCandidateQueueRef = useRef({});
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingCheckRef = useRef(null);
  const wasSpeakingRef = useRef(false);
  const voiceUsersRef = useRef({});
  const remoteSpeakingMonitorsRef = useRef({});
  const voiceChannelIdRef = useRef(null);
  const voiceConversationIdRef = useRef(null);
  const voiceTeamIdRef = useRef(null);
  const myVoiceClientIdRef = useRef(createVoiceClientId());
  /** Channels the user explicitly left — blocks VoiceChannel auto-rejoin until they join again. */
  const suppressAutoJoinChannelsRef = useRef(new Set());
  const recentVoiceJoinUntilRef = useRef(0);
  const voiceSoundsRef = useRef({
    join: () => {},
    leave: () => {},
    mute: () => {},
    unmute: () => {},
    streamStart: () => {},
    streamStop: () => {},
  });
  const voiceStateSoundBurstRef = useRef({ at: 0, count: 0 });
  const leaveAnimTimerRef = useRef(null);
  const pendingLeaveFinishRef = useRef(null);
  const isLeavingCallRef = useRef(false);
  const socketRef = useRef(socket);

  useEffect(() => {
    voiceSoundsRef.current = {
      join: playVoiceJoin,
      leave: playVoiceLeave,
      mute: playVoiceMute,
      unmute: playVoiceUnmute,
      streamStart: playStreamStart,
      streamStop: playStreamStop,
    };
  }, [playVoiceJoin, playVoiceLeave, playVoiceMute, playVoiceUnmute, playStreamStart, playStreamStop]);

  const playVoiceStateSound = useCallback((muted) => {
    const now = Date.now();
    const burst = voiceStateSoundBurstRef.current;
    if (now - burst.at > 700) {
      burst.at = now;
      burst.count = 0;
    }
    burst.count += 1;
    // Avoid machine-gun audio for bulk moderation actions such as muting everyone.
    if (burst.count > 3) return;
    if (muted) voiceSoundsRef.current.mute();
    else voiceSoundsRef.current.unmute();
  }, []);

  const cancelLeaveAnimation = useCallback(() => {
    if (leaveAnimTimerRef.current) {
      clearTimeout(leaveAnimTimerRef.current);
      leaveAnimTimerRef.current = null;
    }
    pendingLeaveFinishRef.current = null;
    isLeavingCallRef.current = false;
    setVoiceLeaveAnim(null);
  }, []);
  const rotateVoiceClientId = useCallback(() => {
    const next = randomUuidV4();
    try { sessionStorage.setItem(VOICE_CLIENT_STORAGE_KEY, next); } catch (_) {}
    myVoiceClientIdRef.current = next;
  }, []);
  const isMutedRef = useRef(initialVoiceMute.isMuted);
  const isDeafenedRef = useRef(initialVoiceMute.isDeafened);

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
    if (!isElectronVoicePrefsEnabled()) return;
    saveElectronVoiceMuteState(isMuted, isDeafened);
  }, [isMuted, isDeafened]);

  const applyPersistedMuteDeafen = useCallback((hasMic) => {
    const effectiveMuted = !hasMic || isMutedRef.current;
    const effectiveDeafened = hasMic && isDeafenedRef.current;
    isMutedRef.current = effectiveMuted;
    isDeafenedRef.current = effectiveDeafened;
    setIsMuted(effectiveMuted);
    setIsDeafened(effectiveDeafened);
    const setTrackEnabled = (stream) => {
      stream?.getAudioTracks?.().forEach((t) => { t.enabled = !effectiveMuted; });
    };
    setTrackEnabled(localStreamRef.current);
    setTrackEnabled(processedStreamRef.current);
    Object.values(remoteVoiceAudioRefs.current).forEach((a) => { a.muted = effectiveDeafened; });
    Object.values(remoteCaptureAudioRefs.current).forEach((a) => { a.muted = effectiveDeafened; });
    saveElectronVoiceMuteState(effectiveMuted, effectiveDeafened);
    return { effectiveMuted, effectiveDeafened };
  }, []);

  useEffect(() => {
    voiceConversationIdRef.current = voiceConversationId;
  }, [voiceConversationId]);

  useEffect(() => {
    if (voiceChannelId == null && voiceConversationId == null) {
      clearMicrophoneIssue();
    }
  }, [voiceChannelId, voiceConversationId, clearMicrophoneIssue]);

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
      persistElectronVoiceMuteFromRefs(isMutedRef, isDeafenedRef);
      trayActionsRef.current.leaveCallOnAppExit?.();
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

  const acquireMicStream = useCallback(async ({ permissionRetry = false } = {}) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access not available in this context.');
    }

    // User-gesture retry: simplest constraint first so Chrome / Capacitor WebView show the OS prompt.
    if (permissionRetry) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        if (isMicrophonePermissionError(err)) throw err;
      }
    }

    const attempts = permissionRetry
      ? [
          () => navigator.mediaDevices.getUserMedia(getAudioConstraints(false)),
          () => navigator.mediaDevices.getUserMedia(getAudioConstraints(true)),
        ]
      : [
          () => navigator.mediaDevices.getUserMedia(getAudioConstraints(true)),
          () => navigator.mediaDevices.getUserMedia(getAudioConstraints(false)),
          () => navigator.mediaDevices.getUserMedia({ audio: true }),
        ];

    let lastErr;
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (err) {
        lastErr = err;
        if (isMicrophonePermissionError(err)) throw err;
      }
    }
    throw lastErr || new Error('Microphone unavailable');
  }, [getAudioConstraints]);

  const hasActiveLocalMic = useCallback(() => {
    const tracks = [
      ...(localStreamRef.current?.getAudioTracks?.() || []),
      ...(processedStreamRef.current?.getAudioTracks?.() || []),
    ];
    return tracks.some(track => track.readyState !== 'ended');
  }, []);

  const startMicSpeechAttemptMonitor = useCallback(async () => {
    if (micAttemptCheckRef.current || !lastMicrophoneIssueRef.current) return;
    if (voiceChannelIdRef.current == null && voiceConversationIdRef.current == null) return;
    if (hasActiveLocalMic()) return;

    try {
      const stream = await acquireMicStream();
      micAttemptStreamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      micAttemptAudioContextRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 120;
      highpass.Q.value = 0.7;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(highpass);
      highpass.connect(analyser);
      micAttemptAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const sampleRate = ctx.sampleRate;
      micAttemptAccumMsRef.current = 0;
      micAttemptLastActiveAtRef.current = 0;

      micAttemptCheckRef.current = setInterval(() => {
        const a = micAttemptAnalyserRef.current;
        if (!a) return;
        const now = Date.now();
        if (isLikelyHumanSpeech(a, dataArray, sampleRate)) {
          const last = micAttemptLastActiveAtRef.current;
          if (last && now - last > MIC_SPEECH_ATTEMPT_GAP_MS) {
            micAttemptAccumMsRef.current = 0;
          }
          micAttemptLastActiveAtRef.current = now;
          micAttemptAccumMsRef.current += SPEAKING_CHECK_INTERVAL;
          if (micAttemptAccumMsRef.current >= MIC_SPEECH_ATTEMPT_RESHOW_MS) {
            restoreMicrophoneIssue();
          }
        } else if (
          micAttemptLastActiveAtRef.current &&
          now - micAttemptLastActiveAtRef.current > MIC_SPEECH_ATTEMPT_GAP_MS
        ) {
          micAttemptAccumMsRef.current = 0;
        }
      }, SPEAKING_CHECK_INTERVAL);
    } catch {
      stopMicSpeechAttemptMonitor();
    }
  }, [acquireMicStream, hasActiveLocalMic, restoreMicrophoneIssue, stopMicSpeechAttemptMonitor]);

  useEffect(() => {
    const inVoice = voiceChannelId != null || voiceConversationId != null;
    const shouldMonitor =
      inVoice &&
      lastMicrophoneIssueRef.current &&
      !microphoneIssue &&
      isMutedRef.current &&
      !hasActiveLocalMic();

    if (!shouldMonitor) {
      stopMicSpeechAttemptMonitor();
      return undefined;
    }

    startMicSpeechAttemptMonitor();
    return () => stopMicSpeechAttemptMonitor();
  }, [
    voiceChannelId,
    voiceConversationId,
    microphoneIssue,
    isMuted,
    startMicSpeechAttemptMonitor,
    stopMicSpeechAttemptMonitor,
    hasActiveLocalMic,
  ]);

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
          if (sk) {
            const scope = voiceChannelIdRef.current
              ? channelSpeakingScopeKey(voiceChannelIdRef.current)
              : voiceConversationIdRef.current
                ? dmSpeakingScopeKey(voiceConversationIdRef.current)
                : null;
            if (scope) {
              setSpeakingUsersByScope((prev) => patchSpeakingInScope(prev, scope, user?.id, isSpeaking));
            }
          }
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

  const getVoiceListenVolume01 = useCallback(() => {
    const base = (settings?.output_volume ?? 100) / 100;
    return Math.min(1, Math.max(0, base));
  }, [settings?.output_volume]);

  /** Live / screen-share listening level (per-user slider × output volume). */
  const getListenVolume01 = useCallback((userId) => {
    const base = (settings?.output_volume ?? 100) / 100;
    return Math.min(1, Math.max(0, base * (getStreamVolumePercent(userId) / 100)));
  }, [settings?.output_volume, getStreamVolumePercent]);

  const applyRemoteSpeakingState = useCallback((scopeKey, userId, isSpeaking) => {
    if (!scopeKey || userId == null) return;
    setSpeakingUsersByScope((prev) => patchSpeakingInScope(prev, scopeKey, userId, isSpeaking));
    if (typeof scopeKey === 'string' && scopeKey.startsWith('dm_')) {
      const convId = scopeKey.slice(3);
      setVoiceUsers((prev) => patchVoiceUserSpeaking(prev, voiceDmRosterKey(convId), userId, isSpeaking));
    } else {
      setVoiceUsers((prev) => patchVoiceUserSpeaking(prev, scopeKey, userId, isSpeaking));
    }
  }, []);

  const stopRemoteSpeakingMonitor = useCallback((peerKeyStr) => {
    const mon = remoteSpeakingMonitorsRef.current[peerKeyStr];
    if (!mon) return;
    if (mon.interval) clearInterval(mon.interval);
    if (mon.ctx) mon.ctx.close().catch(() => {});
    delete remoteSpeakingMonitorsRef.current[peerKeyStr];
  }, []);

  const startRemoteSpeakingMonitor = useCallback((peerKeyStr, stream) => {
    const { userId: rosterUserId } = parsePeerKey(peerKeyStr);
    if (rosterUserId == null || sameUserId(rosterUserId, user?.id)) return;
    const dm = voiceConversationIdRef.current;
    const ch = voiceChannelIdRef.current;
    const scopeKey = dm != null ? dmSpeakingScopeKey(dm) : ch != null ? channelSpeakingScopeKey(ch) : null;
    if (!scopeKey || !stream?.getAudioTracks?.().length) return;

    stopRemoteSpeakingMonitor(peerKeyStr);

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let wasSpeaking = false;

      const interval = setInterval(() => {
        if (!stream.getAudioTracks().some((t) => t.readyState === 'live')) return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const isSpeaking = avg > SPEAKING_THRESHOLD;
        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          applyRemoteSpeakingState(scopeKey, rosterUserId, isSpeaking);
        }
      }, SPEAKING_CHECK_INTERVAL);

      remoteSpeakingMonitorsRef.current[peerKeyStr] = { interval, ctx };
    } catch (err) {
      console.warn('Remote speaking monitor failed:', err);
    }
  }, [user?.id, stopRemoteSpeakingMonitor, applyRemoteSpeakingState]);

  const playRemoteAudio = useCallback((peerKeyStr, stream, audioRefs, getVolume01, monitorSpeaking) => {
    const { userId: rosterUserId } = parsePeerKey(peerKeyStr);
    ensurePeerInVoiceRoster(rosterUserId);
    if (voiceConversationIdRef.current) {
      setDmRemoteMediaReady(true);
    }
    let audio = audioRefs.current[peerKeyStr];
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      audioRefs.current[peerKeyStr] = audio;
    }
    audio.srcObject = stream;
    audio.volume = getVolume01(rosterUserId);
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
    if (monitorSpeaking) {
      startRemoteSpeakingMonitor(peerKeyStr, stream);
    }
  }, [settings?.output_device, ensurePeerInVoiceRoster, startRemoteSpeakingMonitor]);

  const playRemoteVoiceStream = useCallback((peerKeyStr, stream) => {
    playRemoteAudio(peerKeyStr, stream, remoteVoiceAudioRefs, getVoiceListenVolume01, true);
  }, [playRemoteAudio, getVoiceListenVolume01]);

  const playRemoteCaptureStream = useCallback((peerKeyStr, stream) => {
    playRemoteAudio(peerKeyStr, stream, remoteCaptureAudioRefs, getListenVolume01, false);
  }, [playRemoteAudio, getListenVolume01]);

  useEffect(() => {
    for (const peerKeyStr of Object.keys(remoteVoiceAudioRefs.current)) {
      const audio = remoteVoiceAudioRefs.current[peerKeyStr];
      if (!audio) continue;
      audio.volume = getVoiceListenVolume01();
    }
    for (const peerKeyStr of Object.keys(remoteCaptureAudioRefs.current)) {
      const audio = remoteCaptureAudioRefs.current[peerKeyStr];
      if (!audio) continue;
      const { userId: uid } = parsePeerKey(peerKeyStr);
      audio.volume = getListenVolume01(uid);
    }
  }, [getVoiceListenVolume01, getListenVolume01]);

  const cleanupPeerConnection = useCallback((peerKeyStr) => {
    stopRemoteSpeakingMonitor(peerKeyStr);
    delete iceCandidateQueueRef.current[peerKeyStr];
    const pc = peerConnectionsRef.current[peerKeyStr];
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
      delete peerConnectionsRef.current[peerKeyStr];
    }
    for (const refs of [remoteVoiceAudioRefs, remoteCaptureAudioRefs]) {
      const audio = refs.current[peerKeyStr];
      if (audio) {
        audio.srcObject = null;
        audio.pause();
        audio.remove();
        delete refs.current[peerKeyStr];
      }
    }
    delete remotePeerVoiceStreamIdRef.current[peerKeyStr];
    delete remoteVoiceAudioStreamsRef.current[peerKeyStr];
    delete remoteCaptureAudioStreamsRef.current[peerKeyStr];
    setRemoteVideoStreams(prev => {
      const next = { ...prev };
      delete next[peerKeyStr];
      return next;
    });
  }, [stopRemoteSpeakingMonitor]);

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
        const assocStream = event.streams?.[0];
        let voiceStreamId = remotePeerVoiceStreamIdRef.current[pk];
        if (voiceStreamId == null) {
          voiceStreamId = assocStream?.id ?? `track-${event.track.id}`;
          remotePeerVoiceStreamIdRef.current[pk] = voiceStreamId;
        }
        const isVoiceTrack = assocStream?.id
          ? assocStream.id === voiceStreamId
          : voiceStreamId === `track-${event.track.id}`;
        const streamsRef = isVoiceTrack ? remoteVoiceAudioStreamsRef : remoteCaptureAudioStreamsRef;
        const playFn = isVoiceTrack ? playRemoteVoiceStream : playRemoteCaptureStream;
        let merged = streamsRef.current[pk];
        if (!merged) {
          merged = new MediaStream();
          streamsRef.current[pk] = merged;
        }
        if (!merged.getTracks().includes(event.track)) {
          merged.addTrack(event.track);
        }
        event.track.onended = () => {
          try {
            merged.removeTrack(event.track);
          } catch (_) {}
          if (merged.getTracks().length === 0) {
            delete streamsRef.current[pk];
          }
        };
        playFn(pk, merged);
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
  }, [socket, cleanupPeerConnection, playRemoteVoiceStream, playRemoteCaptureStream, ensurePeerInVoiceRoster, emitVoiceSignal]);

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
    setVoiceMiniIslandPreview(null);

    stopSpeakingDetection();
    for (const refs of [remoteVoiceAudioRefs, remoteCaptureAudioRefs]) {
      Object.values(refs.current).forEach(a => {
        a.srcObject = null;
        a.pause();
        a.remove();
      });
      refs.current = {};
    }
    remotePeerVoiceStreamIdRef.current = {};
    remoteVoiceAudioStreamsRef.current = {};
    remoteCaptureAudioStreamsRef.current = {};
    setStreamVolumeByUserId({});
    setDmRemoteMediaReady(false);
  }, [cleanupPeerConnection, stopSpeakingDetection, teardownLocalScreenCapture]);

  const cleanupAllConnectionsRef = useRef(cleanupAllConnections);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);
  useEffect(() => {
    cleanupAllConnectionsRef.current = cleanupAllConnections;
  }, [cleanupAllConnections]);

  // After Socket.IO reconnect: new voice client id + full media/WebRTC refresh (multi-device safe).
  useEffect(() => {
    if (!socket) return;
    const onReconnect = async () => {
      if (isLeavingCallRef.current) return;
      const ch = coercePositiveInt(voiceChannelIdRef.current);
      const dm = voiceConversationIdRef.current;
      if (ch == null && dm == null) return;

      rotateVoiceClientId();
      cleanupAllConnections();

      try {
        const stream = await acquireMicStream();
        localStreamRef.current = stream;
        await startSpeakingDetection(stream);
        clearMicrophoneIssue();
        applyPersistedMuteDeafen(true);
      } catch (err) {
        showMicrophoneIssue(err);
        isMutedRef.current = true;
        setIsMuted(true);
        saveElectronVoiceMuteState(true, isDeafenedRef.current);
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
  }, [socket, rotateVoiceClientId, cleanupAllConnections, acquireMicStream, startSpeakingDetection, showMicrophoneIssue, clearMicrophoneIssue, applyPersistedMuteDeafen]);

  const joinVoice = useCallback(async (channelId, teamId, channelName) => {
    const chId = coercePositiveInt(channelId);
    const tId = coercePositiveInt(teamId);
    if (chId == null) {
      console.warn('joinVoice: invalid channelId', channelId);
      return;
    }

    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    } catch (_) {
      /* WebView may suspend AudioContext until user gesture */
    }

    suppressAutoJoinChannelsRef.current.delete(chId);
    recentVoiceJoinUntilRef.current = Date.now() + 5000;
    cancelLeaveAnimation();

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

    const prevJoined = coercePositiveInt(voiceChannelIdRef.current);
    const prevConversationId = voiceConversationIdRef.current;

    setConnectionState('connecting');
    setVoiceChannelId(chId);
    voiceChannelIdRef.current = chId;
    setVoiceTeamId(tId);
    voiceTeamIdRef.current = tId;
    setVoiceChannelName(channelName);
    setVoiceViewMinimized(false);

    // Wait for socket to be connected (handles returning after idle/disconnect)
    if (socket && !socket.connected) {
      try {
        await waitForSocketConnected(socket, 5000);
      } catch {
        console.warn('Socket reconnect timed out, joining anyway...');
      }
    }

    // Leave any previous voice (server or DM) — after socket is ready.
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
    if (prevConversationId) {
      rotateVoiceClientId();
      if (socket) socket.emit('voice_leave_dm', { conversationId: prevConversationId });
      cleanupAllConnections();
      const dmKey = `dm_${prevConversationId}`;
      setVoiceUsers(prev => {
        const next = { ...prev };
        if (next[dmKey]) {
          next[dmKey] = filterOutSelfInVoiceList(next[dmKey], user?.id);
          if (next[dmKey].length === 0) delete next[dmKey];
        }
        return next;
      });
      setVoiceConversationId(null);
      voiceConversationIdRef.current = null;
      setVoiceConversationName('');
      setDmCallCallerId(null);
    }

    // Acquire mic (run in parallel with socket wait when possible)
    let hasMic = false;
    try {
      const stream = await acquireMicStream();
      localStreamRef.current = stream;
      await startSpeakingDetection(stream);
      clearMicrophoneIssue();
      hasMic = true;
    } catch (err) {
      console.warn('No microphone available, joining as listen-only:', err?.message);
      showMicrophoneIssue(err);
      isMutedRef.current = true;
      setIsMuted(true);
    }

    const { effectiveMuted, effectiveDeafened } = applyPersistedMuteDeafen(hasMic);

    const selfUser = user?.id
      ? {
          id: user.id,
          display_name: user.display_name ?? 'User',
          avatar_url: user.avatar_url ?? null,
          muted: effectiveMuted,
          deafened: effectiveDeafened,
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
      socket.emit('voice_state', {
        channelId: chId,
        muted: effectiveMuted,
        deafened: effectiveDeafened,
      });
    }

    setConnectionState('connected');
    window.electron?.blockPowerSave?.();
    voiceSoundsRef.current.join();
  }, [socket, user, acquireMicStream, startSpeakingDetection, cleanupAllConnections, rotateVoiceClientId, showMicrophoneIssue, clearMicrophoneIssue, applyPersistedMuteDeafen]);

  const finishLeaveVoice = useCallback((channelId, skipEmit) => {
    recentVoiceJoinUntilRef.current = 0;
    setVoiceUsers((prev) => {
      const next = removeSelfFromChannelRoster(prev, channelId, user?.id);
      const keys = voiceChannelRosterKeys(channelId);
      const channelEmpty = keys.every((k) => !Array.isArray(next[k]) || next[k].length === 0);
      if (channelEmpty) {
        setVoiceChannelMeta((meta) => {
          const metaNext = { ...meta };
          for (const k of keys) delete metaNext[k];
          return metaNext;
        });
      }
      return next;
    });
    setSpeakingUsersByScope((prev) =>
      clearSelfFromScopes(prev, channelScopeLookupKeys(channelId), user?.id),
    );
    const disconnectedTeamId = voiceTeamIdRef.current;
    setVoiceChannelId(null);
    voiceChannelIdRef.current = null;
    setVoiceTeamId(null);
    voiceTeamIdRef.current = null;
    setVoiceChannelName('');
    setVoiceViewMinimized(false);
    setConnectionState('disconnected');
    setVoiceLeaveAnim(null);
    isLeavingCallRef.current = false;
    window.electron?.unblockPowerSave?.();
    if (!skipEmit) {
      window.dispatchEvent(new CustomEvent('slide:voice-channel-disconnect', {
        detail: { teamId: disconnectedTeamId },
      }));
      if (socket?.connected) socket.emit('voice_sync');
    }
  }, [socket, user?.id]);

  const leaveVoice = useCallback((options = {}) => {
    const opts = typeof options === 'object' && options !== null ? options : {};
    const { skipEmit = false, animate = true } = opts;
    if (!voiceChannelIdRef.current || isLeavingCallRef.current) return;
    recentVoiceJoinUntilRef.current = 0;

    const channelId = voiceChannelIdRef.current;
    const chId = coercePositiveInt(channelId);
    if (chId != null) suppressAutoJoinChannelsRef.current.add(chId);

    if (socket && !skipEmit) {
      socket.emit('voice_leave', { channelId: chId ?? channelId });
      socket.emit('voice_leave_all');
    }

    isLeavingCallRef.current = true;
    voiceSoundsRef.current.leave();
    if (leaveAnimTimerRef.current) {
      clearTimeout(leaveAnimTimerRef.current);
      leaveAnimTimerRef.current = null;
    }
    pendingLeaveFinishRef.current = null;

    setVoiceLeaveAnim({
      kind: 'channel',
      channelId: chId ?? channelId,
      channelName: voiceChannelName || 'Voice',
      userId: user?.id ?? null,
    });
    setConnectionState('leaving');
    cleanupAllConnections();

    const ms = getVoiceLeaveAnimMs(skipEmit, animate);
    const finish = () => finishLeaveVoice(channelId, skipEmit);
    if (ms <= 0) {
      finish();
      return;
    }
    pendingLeaveFinishRef.current = finish;
    leaveAnimTimerRef.current = setTimeout(() => {
      leaveAnimTimerRef.current = null;
      pendingLeaveFinishRef.current = null;
      finish();
    }, ms);
  }, [socket, user?.id, voiceChannelName, cleanupAllConnections, finishLeaveVoice]);

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

    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    } catch (_) {
      /* Android WebView */
    }

    removeDeclinedDmConv(convId);
    recentVoiceJoinUntilRef.current = Date.now() + 5000;
    cancelLeaveAnimation();
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
    setVoiceViewMinimized(false);

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
      voiceChannelIdRef.current = null;
      setVoiceTeamId(null);
      voiceTeamIdRef.current = null;
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
      clearMicrophoneIssue();
      hasMic = true;
    } catch (err) {
      console.warn('No microphone available, joining DM as listen-only:', err?.message);
      showMicrophoneIssue(err);
      isMutedRef.current = true;
      setIsMuted(true);
    }

    const { effectiveMuted, effectiveDeafened } = applyPersistedMuteDeafen(hasMic);

    const selfUser = user?.id
      ? {
          id: user.id,
          display_name: user.display_name ?? 'User',
          avatar_url: user.avatar_url ?? null,
          muted: effectiveMuted,
          deafened: effectiveDeafened,
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
      socket.emit('voice_state_dm', {
        conversationId: convId,
        muted: effectiveMuted,
        deafened: effectiveDeafened,
      });
    };
    emitDmJoin();
    if (socket && !socket.connected) {
      socket.once('connect', emitDmJoin);
    }

    setConnectionState('connected');
    window.electron?.blockPowerSave?.();
    voiceSoundsRef.current.join();
  }, [socket, user, acquireMicStream, startSpeakingDetection, cleanupAllConnections, rotateVoiceClientId, removeDeclinedDmConv, showMicrophoneIssue, clearMicrophoneIssue, applyPersistedMuteDeafen]);

  const finishLeaveVoiceDM = useCallback((conversationId, convId, skipEmit) => {
    recentVoiceJoinUntilRef.current = 0;
    setVoiceUsers((prev) => removeSelfFromDmRoster(prev, conversationId, user?.id));
    setSpeakingUsersByScope((prev) =>
      clearSelfFromScopes(prev, [dmSpeakingScopeKey(conversationId)], user?.id),
    );
    setVoiceConversationId(null);
    voiceConversationIdRef.current = null;
    setVoiceConversationName('');
    setDmCallCallerId(null);
    removeDeclinedDmConv(conversationId);
    setVoiceViewMinimized(false);
    setDmFloatingPanelCollapsed(false);
    setConnectionState('disconnected');
    setDmRemoteMediaReady(false);
    setVoiceLeaveAnim(null);
    isLeavingCallRef.current = false;
    window.electron?.unblockPowerSave?.();
    if (!skipEmit) {
      window.dispatchEvent(new CustomEvent('slide:dm-call-disconnect', { detail: { conversationId: convId } }));
      if (socket?.connected) socket.emit('voice_sync');
    }
  }, [socket, removeDeclinedDmConv, user?.id]);

  const leaveVoiceDM = useCallback((options = {}) => {
    const opts = typeof options === 'object' && options !== null ? options : {};
    const { skipEmit = false, animate = true } = opts;
    if (!voiceConversationIdRef.current || isLeavingCallRef.current) return;
    recentVoiceJoinUntilRef.current = 0;

    const conversationId = voiceConversationIdRef.current;
    const convId = coercePositiveInt(conversationId) ?? conversationId;

    if (socket && !skipEmit) {
      socket.emit('voice_leave_dm', { conversationId: convId });
      socket.emit('voice_leave_all');
    }

    isLeavingCallRef.current = true;
    voiceSoundsRef.current.leave();
    if (leaveAnimTimerRef.current) {
      clearTimeout(leaveAnimTimerRef.current);
      leaveAnimTimerRef.current = null;
    }
    pendingLeaveFinishRef.current = null;

    setVoiceLeaveAnim({
      kind: 'dm',
      conversationId: convId,
      conversationName: voiceConversationName || 'DM Call',
      userId: user?.id ?? null,
    });
    setConnectionState('leaving');
    cleanupAllConnections();

    const ms = getVoiceLeaveAnimMs(skipEmit, animate);
    const finish = () => finishLeaveVoiceDM(conversationId, convId, skipEmit);
    if (ms <= 0) {
      finish();
      return;
    }
    pendingLeaveFinishRef.current = finish;
    leaveAnimTimerRef.current = setTimeout(() => {
      leaveAnimTimerRef.current = null;
      pendingLeaveFinishRef.current = null;
      finish();
    }, ms);
  }, [socket, user?.id, voiceConversationName, cleanupAllConnections, finishLeaveVoiceDM]);

  /** Leave voice on app exit / crash teardown — play leave sound, skip UI animation. */
  const leaveCallOnAppExit = useCallback(() => {
    const exitOpts = { animate: false };
    if (voiceChannelIdRef.current) leaveVoice(exitOpts);
    else if (voiceConversationIdRef.current) leaveVoiceDM(exitOpts);
  }, [leaveVoice, leaveVoiceDM]);

  const shouldAutoJoinChannel = useCallback((channelId) => {
    const id = coercePositiveInt(channelId);
    if (id == null) return true;
    return !suppressAutoJoinChannelsRef.current.has(id);
  }, []);

  const clearSuppressAutoJoin = useCallback((channelId) => {
    const id = coercePositiveInt(channelId);
    if (id != null) suppressAutoJoinChannelsRef.current.delete(id);
  }, []);

  const suppressAutoJoin = useCallback((channelId) => {
    const id = coercePositiveInt(channelId);
    if (id != null) suppressAutoJoinChannelsRef.current.add(id);
  }, []);

  /** Resume Web Audio + unlock playback — required on Android WebView after user tap. */
  const resumeVoiceSession = useCallback(async () => {
    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    } catch (e) {
      console.warn('resumeVoiceSession:', e?.message);
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioContextRef.current) {
        const ctx = new Ctx();
        if (ctx.state === 'suspended') await ctx.resume();
        ctx.close?.();
      }
    } catch (_) {
      /* ignore */
    }
  }, []);

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

  const releaseLocalMicForRetry = useCallback(() => {
    stopMicSpeechAttemptMonitor();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    stopSpeakingDetection();
  }, [stopMicSpeechAttemptMonitor, stopSpeakingDetection]);

  const retryMicrophoneAccess = useCallback(async () => {
    releaseLocalMicForRetry();
    const stream = await acquireMicStream({ permissionRetry: true });
    localStreamRef.current = stream;
    await startSpeakingDetection(stream);
    clearMicrophoneIssue();
    isMutedRef.current = false;
    setIsMuted(false);
    saveElectronVoiceMuteState(false, false);
    playVoiceStateSound(false);
    if (isDeafened) {
      setIsDeafened(false);
      isDeafenedRef.current = false;
      Object.values(remoteVoiceAudioRefs.current).forEach((a) => { a.muted = false; });
      Object.values(remoteCaptureAudioRefs.current).forEach((a) => { a.muted = false; });
    }
    if (socket) {
      if (voiceChannelIdRef.current) {
        socket.emit('voice_state', { channelId: voiceChannelIdRef.current, muted: false, deafened: false });
      } else if (voiceConversationIdRef.current) {
        socket.emit('voice_state_dm', { conversationId: voiceConversationIdRef.current, muted: false, deafened: false });
      }
    }
    setVoiceUsers((prev2) => {
      const chId = voiceChannelIdRef.current || (voiceConversationIdRef.current ? `dm_${voiceConversationIdRef.current}` : null);
      if (!chId || !prev2[chId]) return prev2;
      return { ...prev2, [chId]: prev2[chId].map((u) => sameUserId(u.id, user?.id) ? { ...u, muted: false, deafened: false } : u) };
    });
    const audioStream = processedStreamRef.current || localStreamRef.current;
    if (audioStream) {
      Object.keys(peerConnectionsRef.current).forEach((targetUserId) => {
        const pc = peerConnectionsRef.current[targetUserId];
        if (!pc || pc.signalingState === 'closed') return;
        const hasAudio = pc.getSenders().some((s) => s.track?.kind === 'audio');
        if (!hasAudio) {
          audioStream.getAudioTracks().forEach((track) => pc.addTrack(track, audioStream));
        }
      });
    }
    renegotiateAllPeerConnections();
    return true;
  }, [
    releaseLocalMicForRetry,
    acquireMicStream,
    startSpeakingDetection,
    clearMicrophoneIssue,
    isDeafened,
    socket,
    user?.id,
    renegotiateAllPeerConnections,
    playVoiceStateSound,
  ]);

  const toggleMute = useCallback(async () => {
    if (serverMutedRef.current) return;

    const permissionBlocked =
      microphoneIssue?.type === 'permission-denied'
      || lastMicrophoneIssueRef.current?.type === 'permission-denied';
    const wantsMic = isMuted || permissionBlocked;
    const shouldRetryMic = wantsMic && (permissionBlocked || !hasActiveLocalMic());

    if (shouldRetryMic) {
      try {
        await retryMicrophoneAccess();
      } catch (err) {
        showMicrophoneIssue(err);
      }
      return;
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
        const muteScope = voiceChannelIdRef.current
          ? channelSpeakingScopeKey(voiceChannelIdRef.current)
          : voiceConversationIdRef.current
            ? dmSpeakingScopeKey(voiceConversationIdRef.current)
            : null;
        if (muteScope) {
          setSpeakingUsersByScope((p) => patchSpeakingInScope(p, muteScope, user?.id, false));
        }
      }
      const newDeafened = newMuted ? isDeafened : false;
      if (!newMuted && isDeafened) {
        setIsDeafened(false);
        isDeafenedRef.current = false;
        Object.values(remoteVoiceAudioRefs.current).forEach(a => { a.muted = false; });
        Object.values(remoteCaptureAudioRefs.current).forEach(a => { a.muted = false; });
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
      playVoiceStateSound(newMuted);
      saveElectronVoiceMuteState(newMuted, newDeafened);
      return newMuted;
    });
  }, [socket, user?.id, isDeafened, isMuted, microphoneIssue, hasActiveLocalMic, retryMicrophoneAccess, showMicrophoneIssue]);

  const toggleDeafen = useCallback(() => {
    if (serverDeafenedRef.current) return;
    setIsDeafened(prev => {
      const newDeafened = !prev;
      Object.values(remoteVoiceAudioRefs.current).forEach(a => { a.muted = newDeafened; });
      Object.values(remoteCaptureAudioRefs.current).forEach(a => { a.muted = newDeafened; });

      let newMuted = isMuted;
      if (newDeafened && !isMuted) {
        newMuted = true;
        isMutedRef.current = true;
        setIsMuted(true);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
        if (processedStreamRef.current) {
          processedStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
      } else if (!newDeafened && isMuted) {
        if (hasActiveLocalMic()) {
          newMuted = false;
          isMutedRef.current = false;
          setIsMuted(false);
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
          }
          if (processedStreamRef.current) {
            processedStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
          }
        } else {
          newMuted = true;
          isMutedRef.current = true;
          setIsMuted(true);
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
      saveElectronVoiceMuteState(newMuted, newDeafened);
      return newDeafened;
    });
  }, [socket, user?.id, isMuted, hasActiveLocalMic]);

  // Keep tray action refs in sync
  useEffect(() => {
    trayActionsRef.current = { toggleMute, leaveVoice, leaveVoiceDM, leaveCallOnAppExit };
  }, [toggleMute, leaveVoice, leaveVoiceDM, leaveCallOnAppExit]);

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
    updateSetting?.('input_device', deviceId || 'default');
    if (!localStreamRef.current || !navigator.mediaDevices?.getUserMedia) return;

    // Immediately clear speaking state while mic is switching
    wasSpeakingRef.current = false;
    const switchScope = voiceChannelIdRef.current
      ? channelSpeakingScopeKey(voiceChannelIdRef.current)
      : voiceConversationIdRef.current
        ? dmSpeakingScopeKey(voiceConversationIdRef.current)
        : null;
    if (switchScope) {
      setSpeakingUsersByScope((prev) => patchSpeakingInScope(prev, switchScope, user?.id, false));
    }
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
    for (const refs of [remoteVoiceAudioRefs, remoteCaptureAudioRefs]) {
      Object.values(refs.current).forEach(audio => {
        if (audio?.setSinkId) {
          audio.setSinkId(deviceId && deviceId !== 'default' ? deviceId : 'default').catch(() => {});
        }
      });
    }
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

  const applyLocalMicMuteState = useCallback((muted) => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    }
    if (processedStreamRef.current) {
      processedStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    }
  }, []);

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
      const merged = deduped.map((u) => {
        const row = sameUserId(u.id, user?.id)
          ? { ...u, muted: isMutedRef.current, deafened: isDeafenedRef.current }
          : u;
        return { ...row, speaking: rosterUserIsSpeaking(row) };
      });
      setSpeakingUsersByScope((prev) => syncSpeakingScopeFromRoster(prev, channelId, merged));
      setVoiceUsers((prev) => {
        const inThisChannel = coercePositiveInt(voiceChannelIdRef.current) === coercePositiveInt(channelId);
        if (!inThisChannel && merged.length === 0) {
          const existing =
            prev[channelId] ||
            prev[coercePositiveInt(channelId)] ||
            prev[String(channelId)];
          if (Array.isArray(existing) && existing.length > 0) return prev;
        }
        return { ...prev, [channelId]: merged };
      });
      if (teamId != null && (channelName || teamName)) {
        setVoiceChannelMeta(prev => ({
          ...prev,
          [channelId]: { channelName: channelName || 'Voice', teamName: teamName || 'Server', teamId },
        }));
      }
      if (coercePositiveInt(voiceChannelIdRef.current) === coercePositiveInt(channelId)) {
        syncPeersFromEndpointRows(users);
      }
    };

    const onVoiceUserJoined = ({ channelId, user: joinedUser, teamId, channelName, teamName }) => {
      setVoiceUsers(prev => {
        const existing = prev[channelId] || [];
        if (existing.some(u => sameUserId(u.id, joinedUser.id))) return prev;
        if (!sameUserId(joinedUser.id, user?.id)) voiceSoundsRef.current.join();
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
      if (coercePositiveInt(voiceChannelIdRef.current) !== coercePositiveInt(channelId)) return;
      const vc = ju?.voice_client_id;
      if (vc == null) return;
      if (sameUserId(ju.id, user?.id) && vc === myVoiceClientIdRef.current) return;
      createPeerConnection(ju.id, vc, true);
    };

    const onVoiceEndpointLeft = ({ channelId, userId, voice_client_id }) => {
      if (coercePositiveInt(voiceChannelIdRef.current) !== coercePositiveInt(channelId)) return;
      if (voice_client_id) cleanupPeerConnection(peerKey(userId, voice_client_id));
    };

    const onVoiceUserLeft = ({ channelId, userId }) => {
      if (sameUserId(userId, user?.id)) {
        const ch = coercePositiveInt(channelId);
        if (ch != null && coercePositiveInt(voiceChannelIdRef.current) === ch) {
          if (isLeavingCallRef.current) {
            suppressAutoJoinChannelsRef.current.add(ch);
            return;
          }
          if (Date.now() < recentVoiceJoinUntilRef.current && socket?.connected) {
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
          }
        }
        return;
      }
      setVoiceUsers(prev => {
        const keys = voiceChannelRosterKeys(channelId);
        let next = { ...prev };
        let anyHad = false;
        for (const key of keys) {
          const existing = next[key];
          if (!Array.isArray(existing)) continue;
          anyHad = true;
          const filtered = existing.filter(u => !sameUserId(u.id, userId));
          if (filtered.length === 0) delete next[key];
          else next[key] = filtered;
        }
        if (!anyHad) return prev;
        const allEmpty = keys.every((k) => !next[k]?.length);
        if (allEmpty) {
          setVoiceChannelMeta(m => {
            const metaNext = { ...m };
            for (const k of keys) delete metaNext[k];
            return metaNext;
          });
        }
        return next;
      });
      setScreenSharingUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      voiceSoundsRef.current.leave();
      cleanupPeersForLogicalUserId(userId);
      setSpeakingUsersByScope((prev) =>
        patchSpeakingInScope(prev, channelSpeakingScopeKey(channelId), userId, false),
      );
      setVoiceUsers((prev) => patchVoiceUserSpeaking(prev, channelId, userId, false));
    };

    const onVoiceStateUpdate = ({ channelId, userId, muted, deafened }) => {
      setVoiceUsers(prev => {
        if (!prev[channelId]) return prev;
        if (!sameUserId(userId, user?.id)) {
          const current = prev[channelId].find(u => sameUserId(u.id, userId));
          if (current && current.muted !== muted) playVoiceStateSound(muted);
        }
        return {
          ...prev,
          [channelId]: prev[channelId].map(u =>
            sameUserId(u.id, userId) ? { ...u, muted, deafened } : u
          ),
        };
      });
    };

    const onVoiceSpeaking = (raw) => {
      const { channelId: rawChannelId, userId, speaking } = normalizeSpeakingPayload(raw);
      if (userId == null || sameUserId(userId, user?.id)) return;
      const channelId =
        rawChannelId ?? findVoiceChannelIdForUser(voiceUsersRef.current, userId);
      if (channelId == null) return;
      setSpeakingUsersByScope((prev) =>
        patchSpeakingInScope(prev, channelSpeakingScopeKey(channelId), userId, speaking),
      );
      setVoiceUsers((prev) => patchVoiceUserSpeaking(prev, channelId, userId, speaking));
    };

    const onVoiceScreenSharing = ({ channelId, userId, sharing }) => {
      if (coercePositiveInt(voiceChannelIdRef.current) !== coercePositiveInt(channelId)) return;
      setScreenSharingUserIds(prev => {
        const next = new Set(prev);
        if (sharing) next.add(userId);
        else next.delete(userId);
        return next;
      });
      if (!sameUserId(userId, user?.id) && !isDeafenedRef.current) {
        if (sharing) voiceSoundsRef.current.streamStart?.();
        else voiceSoundsRef.current.streamStop?.();
      }
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
        if (!sameUserId(joinedUser.id, user?.id)) voiceSoundsRef.current.join();
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
      if (sameUserId(userId, user?.id)) {
        if (Number(voiceConversationIdRef.current) === Number(conversationId)) {
          if (isLeavingCallRef.current) return;
          if (Date.now() < recentVoiceJoinUntilRef.current && socket?.connected) {
            socket.emit('voice_join_dm', {
              conversationId,
              voiceClientId: myVoiceClientIdRef.current,
            });
            socket.emit('voice_state_dm', {
              conversationId,
              muted: isMutedRef.current,
              deafened: isDeafenedRef.current,
            });
          }
        }
        return;
      }
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        const existing = prev[key] || [];
        const filtered = existing.filter(u => !sameUserId(u.id, userId));
        if (filtered.length === 0) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: filtered };
      });
      voiceSoundsRef.current.leave();
      cleanupPeersForLogicalUserId(userId);
      setSpeakingUsersByScope((prev) =>
        patchSpeakingInScope(prev, dmSpeakingScopeKey(conversationId), userId, false),
      );
      setVoiceUsers((prev) =>
        patchVoiceUserSpeaking(prev, dmSpeakingScopeKey(conversationId), userId, false),
      );
    };

    const onVoiceStateUpdateDm = ({ conversationId, userId, muted, deafened }) => {
      setVoiceUsers(prev => {
        const key = dmKey(conversationId);
        if (!prev[key]) return prev;
        if (!sameUserId(userId, user?.id)) {
          const current = prev[key].find(u => sameUserId(u.id, userId));
          if (current && current.muted !== muted) playVoiceStateSound(muted);
        }
        return {
          ...prev,
          [key]: prev[key].map(u =>
            sameUserId(u.id, userId) ? { ...u, muted, deafened } : u
          ),
        };
      });
    };

    const onVoiceSpeakingDm = (raw) => {
      const { conversationId, userId, speaking } = normalizeSpeakingPayload(raw);
      if (userId == null || sameUserId(userId, user?.id) || conversationId == null) return;
      const dmScope = dmSpeakingScopeKey(conversationId);
      setSpeakingUsersByScope((prev) =>
        patchSpeakingInScope(prev, dmScope, userId, speaking),
      );
      setVoiceUsers((prev) => patchVoiceUserSpeaking(prev, dmScope, userId, speaking));
    };

    const onVoiceScreenSharingDm = ({ conversationId, userId, sharing }) => {
      if (voiceConversationIdRef.current !== conversationId) return;
      setScreenSharingUserIds(prev => {
        const next = new Set(prev);
        if (sharing) next.add(userId);
        else next.delete(userId);
        return next;
      });
      if (!sameUserId(userId, user?.id) && !isDeafenedRef.current) {
        if (sharing) voiceSoundsRef.current.streamStart?.();
        else voiceSoundsRef.current.streamStop?.();
      }
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

    const onVoiceYouLeft = ({ kind, channelId, conversationId, reason }) => {
      if (kind === 'channel') {
        const ch = coercePositiveInt(channelId);
        if (ch != null && coercePositiveInt(voiceChannelIdRef.current) === ch) {
          if (isLeavingCallRef.current) return;
          if (reason === 'moderated') {
            leaveVoice();
            return;
          }
          if (Date.now() < recentVoiceJoinUntilRef.current && socket?.connected) {
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
          }
        }
      } else if (kind === 'dm') {
        const conv = coercePositiveInt(conversationId);
        if (conv != null && Number(voiceConversationIdRef.current) === Number(conv)) {
          if (isLeavingCallRef.current) return;
          if (Date.now() < recentVoiceJoinUntilRef.current && socket?.connected) {
            socket.emit('voice_join_dm', {
              conversationId: conv,
              voiceClientId: myVoiceClientIdRef.current,
            });
            socket.emit('voice_state_dm', {
              conversationId: conv,
              muted: isMutedRef.current,
              deafened: isDeafenedRef.current,
            });
          }
        }
      }
    };
    const onVoiceModerated = ({ channelId, muted, deafened, server_muted, server_deafened }) => {
      if (server_muted !== undefined) serverMutedRef.current = !!server_muted;
      if (server_deafened !== undefined) serverDeafenedRef.current = !!server_deafened;
      const ch = coercePositiveInt(channelId);
      if (ch == null || coercePositiveInt(voiceChannelIdRef.current) !== ch) return;
      if (muted !== undefined) {
        isMutedRef.current = !!muted;
        setIsMuted(!!muted);
        applyLocalMicMuteState(!!muted);
      }
      if (deafened !== undefined) {
        isDeafenedRef.current = !!deafened;
        setIsDeafened(!!deafened);
        Object.values(remoteVoiceAudioRefs.current).forEach((a) => { a.muted = !!deafened; });
        Object.values(remoteCaptureAudioRefs.current).forEach((a) => { a.muted = !!deafened; });
      }
    };

    socket.on('voice_moderated', onVoiceModerated);
    socket.on('voice_you_left', onVoiceYouLeft);

    const onVoicePresenceSync = ({ channels = [], dmConversations = [] }) => {
      const normalizedChannels = channels.map(normalizePresenceChannel).filter(Boolean);
      const normalizedDms = dmConversations.map(normalizePresenceDm).filter((c) => c != null);
      const serverChannels = new Set(normalizedChannels.map((c) => c.id));
      const serverDms = new Set(normalizedDms);
      const localCh = coercePositiveInt(voiceChannelIdRef.current);
      const localDm = coercePositiveInt(voiceConversationIdRef.current);

      if (isLeavingCallRef.current) return;

      if (localCh == null && localDm == null) {
        const recoveredChannel = normalizedChannels[0];
        if (recoveredChannel) {
          voiceChannelIdRef.current = recoveredChannel.id;
          voiceTeamIdRef.current = recoveredChannel.teamId;
          setVoiceChannelId(recoveredChannel.id);
          setVoiceTeamId(recoveredChannel.teamId);
          setVoiceChannelName(recoveredChannel.name || 'Voice Channel');
          setVoiceConversationId(null);
          voiceConversationIdRef.current = null;
          setVoiceConversationName('');
          setConnectionState('connected');
          setVoiceViewMinimized(false);
          window.electron?.blockPowerSave?.();
          if (recoveredChannel.teamId != null || recoveredChannel.name || recoveredChannel.teamName) {
            setVoiceChannelMeta((prev) => ({
              ...prev,
              [recoveredChannel.id]: {
                channelName: recoveredChannel.name || 'Voice Channel',
                teamName: recoveredChannel.teamName || 'Server',
                teamId: recoveredChannel.teamId,
              },
            }));
          }
          if (socket?.connected) {
            socket.emit('voice_state', {
              channelId: recoveredChannel.id,
              muted: isMutedRef.current,
              deafened: isDeafenedRef.current,
            });
          }
          return;
        }

        const recoveredDm = normalizedDms[0];
        if (recoveredDm != null) {
          voiceConversationIdRef.current = recoveredDm;
          setVoiceConversationId(recoveredDm);
          setVoiceConversationName('DM Call');
          setVoiceChannelId(null);
          voiceChannelIdRef.current = null;
          setVoiceTeamId(null);
          voiceTeamIdRef.current = null;
          setVoiceChannelName('');
          setConnectionState('connected');
          setVoiceViewMinimized(false);
          setDmFloatingPanelCollapsed(false);
          window.electron?.blockPowerSave?.();
          if (socket?.connected) {
            socket.emit('voice_state_dm', {
              conversationId: recoveredDm,
              muted: isMutedRef.current,
              deafened: isDeafenedRef.current,
            });
          }
          return;
        }
      }

      if (localCh != null && !serverChannels.has(localCh)) {
        if (Date.now() < recentVoiceJoinUntilRef.current && socket?.connected) {
          const tid = coercePositiveInt(voiceTeamIdRef.current);
          socket.emit('voice_join', {
            channelId: localCh,
            teamId: tid ?? 0,
            voiceClientId: myVoiceClientIdRef.current,
          });
          socket.emit('voice_state', {
            channelId: localCh,
            muted: isMutedRef.current,
            deafened: isDeafenedRef.current,
          });
        } else {
          suppressAutoJoinChannelsRef.current.add(localCh);
          leaveVoice({ skipEmit: true });
        }
      }
      if (localDm != null && !serverDms.has(localDm)) {
        if (Date.now() < recentVoiceJoinUntilRef.current && socket?.connected) {
          socket.emit('voice_join_dm', {
            conversationId: localDm,
            voiceClientId: myVoiceClientIdRef.current,
          });
          socket.emit('voice_state_dm', {
            conversationId: localDm,
            muted: isMutedRef.current,
            deafened: isDeafenedRef.current,
          });
        } else {
          leaveVoiceDM({ skipEmit: true });
        }
      }
      if (!user?.id) return;
      setVoiceUsers((prev) => {
        let next = { ...prev };
        let changed = false;
        for (const [key, list] of Object.entries(prev)) {
          if (!Array.isArray(list)) continue;
          if (key.startsWith('dm_')) {
            const convId = coercePositiveInt(key.slice(3));
            if (convId != null && !serverDms.has(convId) && next[key]) {
              next = clearDmRoster(next, convId);
              changed = true;
            }
          } else {
            const chId = coercePositiveInt(key);
            if (chId != null && !serverChannels.has(chId)) {
              const hadSelf = list.some((u) => sameUserId(u.id, user.id));
              if (hadSelf) {
                next = clearChannelRoster(next, chId);
                changed = true;
              }
            }
          }
        }
        return changed ? next : prev;
      });
      setVoiceChannelMeta((prev) => {
        let next = { ...prev };
        let changed = false;
        for (const key of Object.keys(prev)) {
          const chId = coercePositiveInt(key);
          if (chId != null && !serverChannels.has(chId)) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    socket.on('voice_presence_sync', onVoicePresenceSync);

    const requestVoiceSync = () => {
      if (socket.connected) socket.emit('voice_sync');
    };
    socket.on('connect', requestVoiceSync);
    requestVoiceSync();

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
      socket.off('voice_moderated', onVoiceModerated);
      socket.off('voice_you_left', onVoiceYouLeft);
      socket.off('voice_presence_sync', onVoicePresenceSync);
      socket.off('connect', requestVoiceSync);
    };
  }, [socket, user?.id, createPeerConnection, cleanupPeerConnection, leaveVoice, leaveVoiceDM, emitVoiceSignal, hasDeclinedDmConv, removeDeclinedDmConv, playVoiceStateSound, applyLocalMicMuteState]);

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
      persistElectronVoiceMuteFromRefs(isMutedRef, isDeafenedRef);
      leaveCallOnAppExit();
    };

    const handlePageHide = () => {
      persistElectronVoiceMuteFromRefs(isMutedRef, isDeafenedRef);
      leaveCallOnAppExit();
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
  }, [leaveCallOnAppExit, socket]);

  // Cleanup on unmount — tell server to drop all voice presence for this session
  useEffect(() => {
    return () => {
      if (leaveAnimTimerRef.current) {
        clearTimeout(leaveAnimTimerRef.current);
        leaveAnimTimerRef.current = null;
      }
      if (pendingLeaveFinishRef.current) {
        pendingLeaveFinishRef.current();
        pendingLeaveFinishRef.current = null;
      }
      const inVoice = voiceChannelIdRef.current || voiceConversationIdRef.current;
      if (inVoice && !isLeavingCallRef.current) {
        voiceSoundsRef.current.leave?.();
      }
      const s = socketRef.current;
      if (s?.connected && inVoice) {
        s.emit('voice_leave_all');
      }
      cleanupAllConnectionsRef.current();
    };
  }, []);

  const moderateVoiceUser = useCallback((teamId, channelId, targetUserId, action, durationMinutes) => {
    if (!socket?.connected) return;
    socket.emit('voice_moderate', {
      teamId: parseInt(teamId, 10),
      channelId: parseInt(channelId, 10),
      targetUserId: parseInt(targetUserId, 10),
      action,
      durationMinutes,
    });
  }, [socket]);

  const value = useMemo(() => ({
    voiceChannelId,
    voiceTeamId,
    voiceChannelName,
    voiceConversationId,
    voiceConversationName,
    voiceLeaveAnim,
    dmCallCallerId,
    incomingCall,
    dismissIncomingCall,
    rejectIncomingCall,
    voiceUsers,
    voiceChannelMeta,
    isMuted,
    isDeafened,
    speakingUsers,
    isUserSpeakingInChannel,
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
    voiceMiniIslandPreview,
    setVoiceMiniIslandPreview,
    voiceViewMinimized,
    setVoiceViewMinimized,
    dmFloatingPanelCollapsed,
    setDmFloatingPanelCollapsed,
    joinVoice,
    leaveVoice,
    shouldAutoJoinChannel,
    clearSuppressAutoJoin,
    suppressAutoJoin,
    resumeVoiceSession,
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
    microphoneIssue,
    clearMicrophoneIssue,
    dismissMicrophoneIssue,
    moderateVoiceUser,
  }), [
    voiceChannelId, voiceTeamId, voiceChannelName,
    voiceConversationId, voiceConversationName, voiceLeaveAnim, dmCallCallerId,
    incomingCall, dismissIncomingCall, rejectIncomingCall,
    voiceUsers, voiceChannelMeta, isMuted, isDeafened, speakingUsers, isUserSpeakingInChannel, connectionState, dmRemoteMediaReady,
    isScreenSharing, isCameraOn, ownScreenStream, ownCameraStream,
    screenSharingUserIds, videoEnabledUserIds, remoteVideoStreams,
    expandedLiveView, voiceMiniIslandPreview, voiceViewMinimized, dmFloatingPanelCollapsed,
    joinVoice, leaveVoice, shouldAutoJoinChannel, clearSuppressAutoJoin, suppressAutoJoin, resumeVoiceSession,
    joinVoiceDM, leaveVoiceDM, ringVoiceDM, ringAgainTrigger,
    toggleMute, toggleDeafen, startScreenShare, stopScreenShare,
    startScreenShareDM, stopScreenShareDM, startCamera, stopCamera,
    switchAudioInput, switchAudioOutput, switchVideoInput,
    screenSharePicker, resolveScreenSharePicker,
    screenShareCaptureAudioActive, setScreenShareCaptureVolume,
    streamVolumeByUserId, setStreamVolumeForUser, getStreamVolumePercent, getListenVolume01,
    microphoneIssue, clearMicrophoneIssue, dismissMicrophoneIssue, moderateVoiceUser,
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
