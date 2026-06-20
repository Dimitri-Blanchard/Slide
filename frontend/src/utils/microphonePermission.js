const PERMISSION_ERROR_NAMES = new Set([
  'NotAllowedError',
  'PermissionDeniedError',
  'SecurityError',
]);

const NO_DEVICE_ERROR_NAMES = new Set([
  'NotFoundError',
  'DevicesNotFoundError',
]);

const ACCESS_FAILED_ERROR_NAMES = new Set([
  'NotReadableError',
  'TrackStartError',
  'AbortError',
]);

export function devicesHaveLabels(devices) {
  return (devices || []).some((device) => device.kind === 'audioinput' && !!device.label);
}

export async function queryMicrophonePermissionState() {
  if (!navigator.permissions?.query) return 'unknown';

  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export async function watchMicrophonePermission(onChange) {
  if (!navigator.permissions?.query) {
    return () => {};
  }

  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    onChange(status.state);

    const handleChange = () => onChange(status.state);
    status.addEventListener('change', handleChange);
    return () => status.removeEventListener('change', handleChange);
  } catch {
    return () => {};
  }
}

export function requestMicrophoneStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('Microphone access not available in this context.'));
  }

  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function isMicrophonePermissionError(err) {
  return PERMISSION_ERROR_NAMES.has(err?.name);
}

export function getMicrophoneBlockedHelp() {
  return 'Microphone bloqué. Autorisez l\'accès dans les paramètres du navigateur ou du site, puis rechargez la page.';
}

export async function resolveMicrophoneIssue(err) {
  const permState = await queryMicrophonePermissionState();
  const errorName = err?.name || '';

  if (permState === 'denied') {
    return {
      type: 'permission-denied',
      label: getMicrophoneBlockedHelp(),
    };
  }

  if (isMicrophonePermissionError(err)) {
    return {
      type: permState === 'prompt' || permState === 'unknown' ? 'permission-prompt' : 'permission-denied',
      label: permState === 'prompt' || permState === 'unknown'
        ? 'Autorisez l\'accès au microphone pour parler.'
        : getMicrophoneBlockedHelp(),
    };
  }

  if (NO_DEVICE_ERROR_NAMES.has(errorName)) {
    return {
      type: 'no-device',
      label: 'Aucun microphone détecté.',
    };
  }

  if (ACCESS_FAILED_ERROR_NAMES.has(errorName)) {
    return {
      type: 'access-failed',
      label: 'Le microphone est utilisé par une autre application.',
    };
  }

  return {
    type: 'access-failed',
    label: 'Impossible d\'accéder au microphone.',
  };
}
