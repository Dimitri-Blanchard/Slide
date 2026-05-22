import { useState, useEffect, useCallback, useRef } from 'react';
import { getToken } from '../utils/tokenStorage';

/**
 * Enumerate audio/video devices for call device selection.
 * Returns inputs (mics), outputs (speakers/headphones), and videoInputs (cameras).
 *
 * Browsers require getUserMedia permission before enumerateDevices returns
 * real device labels/IDs. When `autoRequestPermission` is true, requests a brief
 * permission grant when the initial enumeration returns unlabeled devices.
 */
export function useMediaDevices({ autoRequestPermission = true } = {}) {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const permissionRequested = useRef(false);

  const enumerate = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      // If we get devices back but none have labels, the browser hasn't
      // granted permission yet. Request a quick getUserMedia to unlock labels.
      const hasLabels = devices.some(d => d.label);
      if (
        autoRequestPermission &&
        getToken() &&
        !hasLabels &&
        devices.length > 0 &&
        !permissionRequested.current
      ) {
        permissionRequested.current = true;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
          // Re-enumerate now that we have permission
          const updated = await navigator.mediaDevices.enumerateDevices();
          applyDevices(updated);
          return;
        } catch (_) {
          // User denied — continue with unlabeled devices
        }
      }

      applyDevices(devices);
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, [autoRequestPermission]);

  function applyDevices(devices) {
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
  }

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
