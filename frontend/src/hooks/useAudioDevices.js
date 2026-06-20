import { useState, useEffect, useCallback, useRef } from 'react';
import {
  devicesHaveLabels,
  queryMicrophonePermissionState,
  requestMicrophoneStream,
  watchMicrophonePermission,
} from '../utils/microphonePermission';

/**
 * Hook for managing audio input/output devices
 * Provides device enumeration, selection, and volume control
 */
export function useAudioDevices(settings) {
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionState, setPermissionState] = useState('unknown');
  const [micLevel, setMicLevel] = useState(0);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const applyPermissionState = useCallback((state, devices) => {
    setPermissionState(state);
    if (state === 'granted') {
      setPermissionGranted(true);
      return;
    }
    if (state === 'denied') {
      setPermissionGranted(false);
      return;
    }
    setPermissionGranted(devicesHaveLabels(devices));
  }, []);

  // Enumerate available devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const permState = await queryMicrophonePermissionState();

      const inputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          value: d.deviceId || 'default',
          label: d.label || `Microphone ${(d.deviceId || 'unknown').slice(0, 8)}`,
        }));

      const outputs = devices
        .filter((d) => d.kind === 'audiooutput')
        .map((d) => ({
          value: d.deviceId || 'default',
          label: d.label || `Speaker ${(d.deviceId || 'unknown').slice(0, 8)}`,
        }));

      if (!inputs.some((d) => d.value === 'default')) {
        inputs.unshift({ value: 'default', label: 'Par défaut' });
      }
      if (!outputs.some((d) => d.value === 'default')) {
        outputs.unshift({ value: 'default', label: 'Par défaut' });
      }

      setInputDevices(inputs);
      setOutputDevices(outputs);
      applyPermissionState(permState, devices);
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, [applyPermissionState]);

  // Request microphone permission (must be called from a user gesture)
  const requestPermission = useCallback(async () => {
    const streamPromise = requestMicrophoneStream();
    try {
      const stream = await streamPromise;
      stream.getTracks().forEach((track) => track.stop());
      setPermissionGranted(true);
      setPermissionState('granted');
      await enumerateDevices();
      return { ok: true };
    } catch (err) {
      console.error('Microphone permission denied:', err);
      const state = await queryMicrophonePermissionState();
      setPermissionState(state);
      setPermissionGranted(false);
      return { ok: false, err, state };
    }
  }, [enumerateDevices]);

  // Start microphone test with visualization
  const startMicTest = useCallback(async () => {
    try {
      const baseAudio = {
        echoCancellation: settings?.echo_cancellation ?? true,
        noiseSuppression: settings?.noise_suppression ?? true,
        autoGainControl: settings?.auto_gain_control ?? true,
      };

      const hasDevice = settings?.input_device && settings.input_device !== 'default';
      let stream;
      try {
        stream = await requestMicrophoneStream();
      } catch (simpleErr) {
        if (!hasDevice) throw simpleErr;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { ...baseAudio, deviceId: { exact: settings.input_device } },
        });
      }

      streamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = (settings?.input_volume ?? 100) / 100;

      source.connect(gainNode);
      gainNode.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(100, (average / 128) * 100);

        const sensitivity = settings?.input_sensitivity ?? 50;
        const threshold = 100 - sensitivity;
        const adjustedLevel = normalizedLevel > threshold ? normalizedLevel : 0;

        setMicLevel(adjustedLevel);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
      setPermissionGranted(true);
      setPermissionState('granted');
      return true;
    } catch (err) {
      console.error('Error starting mic test:', err);
      const state = await queryMicrophonePermissionState();
      setPermissionState(state);
      setPermissionGranted(false);
      return false;
    }
  }, [settings]);

  const stopMicTest = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setMicLevel(0);
  }, []);

  const setOutputDevice = useCallback(async (audioElement, deviceId) => {
    if (!audioElement || !audioElement.setSinkId) {
      console.warn('setSinkId not supported');
      return false;
    }

    try {
      await audioElement.setSinkId(deviceId || 'default');
      return true;
    } catch (err) {
      console.error('Error setting output device:', err);
      return false;
    }
  }, []);

  const playTestSound = useCallback(async () => {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.volume = (settings?.output_volume ?? 100) / 100;

      if (settings?.output_device && settings.output_device !== 'default' && audio.setSinkId) {
        await audio.setSinkId(settings.output_device);
      }

      await audio.play();
    } catch (err) {
      console.error('Error playing test sound:', err);
    }
  }, [settings]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return undefined;

    enumerateDevices();

    const handleDeviceChange = () => enumerateDevices();
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    let unwatchPermission = () => {};
    watchMicrophonePermission((state) => {
      setPermissionState(state);
      if (state === 'granted') {
        setPermissionGranted(true);
        enumerateDevices();
      } else if (state === 'denied') {
        setPermissionGranted(false);
      }
    }).then((unwatch) => {
      unwatchPermission = unwatch;
    });

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
      unwatchPermission();
      stopMicTest();
    };
  }, [enumerateDevices, stopMicTest]);

  return {
    inputDevices,
    outputDevices,
    permissionGranted,
    permissionState,
    microphoneBlocked: permissionState === 'denied',
    micLevel,
    requestPermission,
    startMicTest,
    stopMicTest,
    setOutputDevice,
    playTestSound,
    refreshDevices: enumerateDevices,
  };
}

export default useAudioDevices;
