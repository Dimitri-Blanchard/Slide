import { useState, useEffect, useCallback } from 'react';

/**
 * Enumerate audio/video devices for call device selection.
 * Returns inputs (mics), outputs (speakers/headphones), and videoInputs (cameras).
 */
export function useMediaDevices() {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);

  const enumerate = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const fallbackLabel = (kind, deviceId, i) => {
      if (kind === 'audioinput') return `Microphone ${i + 1}`;
      if (kind === 'audiooutput') return `Speakers ${i + 1}`;
      if (kind === 'videoinput') return `Camera ${i + 1}`;
      return `Device ${i + 1}`;
    };
    const mapDevices = (kind, defaultLabel) => {
      const list = devices.filter(d => d.kind === kind);
      return list.map((d, i) => ({
        value: d.deviceId || 'default',
        label: d.label || fallbackLabel(kind, d.deviceId, i) || defaultLabel,
      }));
    };
    setInputs(mapDevices('audioinput', 'Microphone'));
    setOutputs(mapDevices('audiooutput', 'Speakers'));
    setVideoInputs(mapDevices('videoinput', 'Camera'));
  }, []);

  useEffect(() => {
    enumerate();
    const handler = () => enumerate();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [enumerate]);

  const withDefault = (arr) => (arr.some(d => d.value === 'default') ? arr : [{ value: 'default', label: 'Default' }, ...arr]);
  return {
    inputs: inputs.length ? withDefault(inputs) : [{ value: 'default', label: 'Default' }],
    outputs: outputs.length ? withDefault(outputs) : [{ value: 'default', label: 'Default' }],
    videoInputs: videoInputs.length ? withDefault(videoInputs) : [{ value: 'default', label: 'Default' }],
  };
}
