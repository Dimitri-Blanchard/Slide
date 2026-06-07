import { useState, useEffect, useRef, useCallback } from 'react';
import { users as usersApi } from '../api';
import { getSpotifyTrackKey } from '../utils/spotifyActivity';

const CLIENT_CHECK_MS = 5000;
const LOCAL_TICK_MS = 250;

function isSpotifyActivelyPlaying(track) {
  if (!track) return false;
  return track.is_playing !== false;
}

function isSpotifyPlayingFromApi(track) {
  if (!track) return false;
  return !!track.is_playing;
}

export function useSpotifyNowPlaying({ userId, initialTrack = null, enabled = true }) {
  const initialPlaying = isSpotifyActivelyPlaying(initialTrack);
  const [track, setTrack] = useState(initialPlaying ? initialTrack : null);
  const [progressMs, setProgressMs] = useState(initialPlaying ? (initialTrack?.progress_ms ?? 0) : 0);

  const trackKeyRef = useRef(initialPlaying ? getSpotifyTrackKey(initialTrack) : '');
  const anchorMsRef = useRef(initialPlaying ? (initialTrack?.progress_ms ?? 0) : 0);
  const anchorAtRef = useRef(Date.now());
  const durationRef = useRef(initialTrack?.duration_ms ?? 0);
  const userIdRef = useRef(userId);
  const enabledRef = useRef(enabled);
  const bootstrappedRef = useRef(false);
  const applyPollResultRef = useRef(null);

  userIdRef.current = userId;
  enabledRef.current = enabled;

  const clearTrack = useCallback(() => {
    setTrack(null);
    setProgressMs(0);
    trackKeyRef.current = '';
    anchorMsRef.current = 0;
    durationRef.current = 0;
  }, []);

  const syncProgressFromAnchor = useCallback(() => {
    if (!trackKeyRef.current) return;
    const duration = durationRef.current;
    if (!duration) return;
    const next = Math.min(duration, anchorMsRef.current + (Date.now() - anchorAtRef.current));
    setProgressMs(next);
  }, []);

  const applyPollResult = useCallback((next, { fromPoll = false } = {}) => {
    const playing = fromPoll ? isSpotifyPlayingFromApi(next) : isSpotifyActivelyPlaying(next);

    if (!next || !playing) {
      clearTrack();
      return;
    }

    const nextKey = getSpotifyTrackKey(next);
    const apiProgress = Math.max(0, next.progress_ms ?? 0);
    const isNewTrack = nextKey !== trackKeyRef.current;

    trackKeyRef.current = nextKey;
    durationRef.current = next.duration_ms ?? 0;
    setTrack(next);

    if (isNewTrack) {
      anchorMsRef.current = apiProgress;
      anchorAtRef.current = Date.now();
      setProgressMs(apiProgress);
    }
  }, [clearTrack]);

  applyPollResultRef.current = applyPollResult;

  useEffect(() => {
    bootstrappedRef.current = false;
  }, [userId]);

  // One-time bootstrap from profile snapshot for instant UI; all sync after that is client-driven.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (!initialTrack || !isSpotifyActivelyPlaying(initialTrack)) return;
    bootstrappedRef.current = true;
    applyPollResult(initialTrack, { fromPoll: false });
  }, [initialTrack, applyPollResult]);

  useEffect(() => {
    if (!enabled || !userId) return undefined;

    const runClientCheck = async () => {
      if (!enabledRef.current || !userIdRef.current) return;
      try {
        const data = await usersApi.getSpotifyNowPlaying(userIdRef.current);
        applyPollResultRef.current?.(data || null, { fromPoll: true });
      } catch {
        /* ignore polling errors */
      }
    };

    runClientCheck();
    const intervalId = setInterval(runClientCheck, CLIENT_CHECK_MS);

    return () => clearInterval(intervalId);
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !track) return undefined;

    syncProgressFromAnchor();
    const tickId = setInterval(syncProgressFromAnchor, LOCAL_TICK_MS);
    return () => clearInterval(tickId);
  }, [enabled, track ? getSpotifyTrackKey(track) : '', syncProgressFromAnchor]);

  return {
    track,
    progressMs,
    durationMs: track?.duration_ms ?? 0,
    isPlaying: !!track,
  };
}
