import React, { createContext, useContext, useCallback, useRef, useMemo, useEffect } from 'react';
import SettingsContext from './SettingsContext';
import { shouldPlayNotificationSound } from '../utils/notificationFocus';

const SoundContext = createContext(null);

// Web Audio API helpers - generate sounds without external files
function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

function playTone(ctx, destination, frequency, duration, volume = 0.3, type = 'sine', startTime = null) {
  if (!ctx || !destination) return;
  try {
    const t0 = startTime ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(destination);
    osc.frequency.value = frequency;
    osc.type = type;
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration);
  } catch (_) {}
}

function playSoftNote(ctx, destination, frequency, duration, peakVolume, attack = 0.028, type = 'sine', startTime = null) {
  if (!ctx || !destination) return;
  try {
    const t0 = startTime ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(destination);
    osc.frequency.value = frequency;
    osc.type = type;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakVolume, t0 + attack);
    gain.gain.setValueAtTime(peakVolume * 0.88, t0 + attack + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch (_) {}
}

/** Message notification — soft but clear two-note chime. */
function playChime(ctx, destination, volume = 0.25) {
  if (!ctx) return;
  const v = volume * 0.09;
  const t0 = ctx.currentTime;
  playSoftNote(ctx, destination, 196, 0.2, v, 0.028, 'sine', t0);
  playSoftNote(ctx, destination, 246.94, 0.22, v * 0.72, 0.03, 'sine', t0 + 0.085);
}

/** @mention ping — slightly higher, same gentle envelope. */
function playPingSound(ctx, destination, volume = 0.3) {
  if (!ctx) return;
  const v = volume * 0.085;
  const t0 = ctx.currentTime;
  playSoftNote(ctx, destination, 220, 0.17, v, 0.026, 'sine', t0);
  playSoftNote(ctx, destination, 277.18, 0.19, v * 0.68, 0.028, 'sine', t0 + 0.078);
}

function playMessageSentSound(ctx, destination, volume = 0.15) {
  if (!ctx) return;
  playTone(ctx, destination, 600, 0.04, volume, 'sine');
}

function playCallEndSound(ctx, destination, volume = 0.2) {
  if (!ctx) return;
  playTone(ctx, destination, 400, 0.1, volume, 'sine');
  setTimeout(() => playTone(ctx, destination, 350, 0.15, volume * 0.8, 'sine'), 100);
}

function playVoiceJoinSound(ctx, destination, volume = 0.2) {
  if (!ctx) return;
  playTone(ctx, destination, 523, 0.07, volume * 0.75, 'sine');
  setTimeout(() => playTone(ctx, destination, 659, 0.08, volume * 0.8, 'sine'), 65);
  setTimeout(() => playTone(ctx, destination, 784, 0.1, volume * 0.7, 'sine'), 130);
}

function playVoiceLeaveSound(ctx, destination, volume = 0.2) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  playTone(ctx, destination, 523, 0.08, volume * 0.7, 'sine', t0);
  playTone(ctx, destination, 392, 0.11, volume * 0.75, 'sine', t0 + 0.075);
}

function playVoiceMuteSound(ctx, destination, volume = 0.16) {
  if (!ctx) return;
  playTone(ctx, destination, 360, 0.05, volume, 'triangle');
  setTimeout(() => playTone(ctx, destination, 240, 0.07, volume * 0.85, 'triangle'), 50);
}

function playVoiceUnmuteSound(ctx, destination, volume = 0.16) {
  if (!ctx) return;
  playTone(ctx, destination, 300, 0.05, volume * 0.85, 'triangle');
  setTimeout(() => playTone(ctx, destination, 520, 0.08, volume, 'triangle'), 55);
}

function playStreamStartSound(ctx, destination, volume = 0.22) {
  if (!ctx) return;
  playTone(ctx, destination, 440, 0.06, volume, 'sine');
  setTimeout(() => playTone(ctx, destination, 554, 0.07, volume * 0.9, 'sine'), 55);
  setTimeout(() => playTone(ctx, destination, 659, 0.09, volume * 0.85, 'sine'), 110);
}

function playStreamStopSound(ctx, destination, volume = 0.18) {
  if (!ctx) return;
  playTone(ctx, destination, 523, 0.07, volume * 0.8, 'sine');
  setTimeout(() => playTone(ctx, destination, 392, 0.1, volume * 0.75, 'sine'), 70);
}

function playSoftTone(ctx, destination, frequency, duration, volume, attack = 0.03) {
  playSoftNote(ctx, destination, frequency, duration, volume, attack, 'sine');
}

function createRingtone(ctx, destination, volume = 0.35) {
  const ringVolume = Math.min(volume * 0.25, 0.06);
  const ring = () => {
    playSoftTone(ctx, destination, 220, 0.25, ringVolume, 0.04);
    setTimeout(() => playSoftTone(ctx, destination, 277, 0.3, ringVolume, 0.04), 180);
  };
  ring();
  return setInterval(ring, 2400);
}

export function SoundProvider({ children }) {
  // useContext instead of useSettings to avoid crash during HMR when SettingsContext
  // may briefly be unavailable; fallback to empty object when outside provider
  const settingsContext = useContext(SettingsContext);
  const settings = settingsContext?.settings ?? {};
  const ctxRef = useRef(null);
  const ringIntervalRef = useRef(null);
  const streamDestRef = useRef(null);
  const routedAudioRef = useRef(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = getAudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }, []);

  const outputDevice = settings?.output_device;
  const useDeviceRouting = outputDevice && outputDevice !== 'default';

  const getDestination = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return { ctx: null, dest: null };

    if (!useDeviceRouting) {
      return { ctx, dest: ctx.destination };
    }

    if (!streamDestRef.current) {
      streamDestRef.current = ctx.createMediaStreamDestination();
      const audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = (settings?.output_volume ?? 100) / 100;
      audio.srcObject = streamDestRef.current.stream;
      if (audio.setSinkId) {
        audio.setSinkId(outputDevice).catch(() => {});
      }
      audio.play().catch(() => {});
      routedAudioRef.current = audio;
    } else if (routedAudioRef.current?.setSinkId && routedAudioRef.current.volume !== undefined) {
      routedAudioRef.current.volume = (settings?.output_volume ?? 100) / 100;
      routedAudioRef.current.setSinkId(outputDevice).catch(() => {});
    }
    return { ctx, dest: streamDestRef.current };
  }, [getCtx, useDeviceRouting, outputDevice, settings?.output_volume]);

  useEffect(() => {
    if (!useDeviceRouting && streamDestRef.current) {
      if (routedAudioRef.current) {
        routedAudioRef.current.srcObject = null;
        routedAudioRef.current.pause();
        routedAudioRef.current = null;
      }
      streamDestRef.current = null;
    } else if (useDeviceRouting && routedAudioRef.current?.setSinkId) {
      routedAudioRef.current.setSinkId(outputDevice).catch(() => {});
      routedAudioRef.current.volume = (settings?.output_volume ?? 100) / 100;
    }
  }, [useDeviceRouting, outputDevice, settings?.output_volume]);

  const volume = useMemo(() => (settings?.output_volume ?? 100) / 100, [settings?.output_volume]);
  const soundVolume = volume * 0.4;

  const playNotification = useCallback(({ force = false } = {}) => {
    if (!force && settings?.notification_sound === false) return;
    if (!shouldPlayNotificationSound({ force })) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playChime(ctx, dest, soundVolume);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const playPing = useCallback(({ force = false } = {}) => {
    if (settings?.notification_sound === false) return;
    if (!shouldPlayNotificationSound({ force })) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playPingSound(ctx, dest, soundVolume);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const playMessageSent = useCallback(() => {
    if (settings?.notification_sound === false) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playMessageSentSound(ctx, dest, soundVolume * 0.5);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const playCallEnd = useCallback(() => {
    const { ctx, dest } = getDestination();
    if (ctx && dest) playCallEndSound(ctx, dest, soundVolume);
  }, [getDestination, soundVolume]);

  const playVoiceJoin = useCallback(() => {
    if (settings?.notification_sound === false) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playVoiceJoinSound(ctx, dest, soundVolume * 0.75);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const playVoiceLeave = useCallback(() => {
    if (settings?.notification_sound === false) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playVoiceLeaveSound(ctx, dest, soundVolume * 0.75);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const playVoiceMute = useCallback(() => {
    if (settings?.notification_sound === false) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playVoiceMuteSound(ctx, dest, soundVolume * 0.7);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const playVoiceUnmute = useCallback(() => {
    if (settings?.notification_sound === false) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playVoiceUnmuteSound(ctx, dest, soundVolume * 0.7);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const playStreamStart = useCallback(() => {
    if (settings?.notification_sound === false) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playStreamStartSound(ctx, dest, soundVolume * 0.8);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const playStreamStop = useCallback(() => {
    if (settings?.notification_sound === false) return;
    const { ctx, dest } = getDestination();
    if (ctx && dest) playStreamStopSound(ctx, dest, soundVolume * 0.75);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const startRingtone = useCallback(({ force = false } = {}) => {
    if (!force && settings?.notification_sound === false) return;
    const { ctx, dest } = getDestination();
    if (!ctx || !dest) return;
    if (ringIntervalRef.current) return;
    ringIntervalRef.current = createRingtone(ctx, dest, soundVolume);
  }, [settings?.notification_sound, getDestination, soundVolume]);

  const stopRingtone = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);

  const value = useMemo(() => ({
    playNotification,
    playPing,
    playMessageSent,
    playCallEnd,
    playVoiceJoin,
    playVoiceLeave,
    playVoiceMute,
    playVoiceUnmute,
    playStreamStart,
    playStreamStop,
    startRingtone,
    stopRingtone,
  }), [playNotification, playPing, playMessageSent, playCallEnd, playVoiceJoin, playVoiceLeave, playVoiceMute, playVoiceUnmute, playStreamStart, playStreamStop, startRingtone, stopRingtone]);

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSounds() {
  const ctx = useContext(SoundContext);
  if (!ctx) return {
    playNotification: () => {},
    playPing: () => {},
    playMessageSent: () => {},
    playCallEnd: () => {},
    playVoiceJoin: () => {},
    playVoiceLeave: () => {},
    playVoiceMute: () => {},
    playVoiceUnmute: () => {},
    playStreamStart: () => {},
    playStreamStop: () => {},
    startRingtone: () => {},
    stopRingtone: () => {},
  };
  return ctx;
}
