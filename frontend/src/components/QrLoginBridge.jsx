import { useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import {
  getPendingQrLoginToken,
  navigateToQrLoginConfirm,
  processPendingQrLoginIfAny,
} from '../utils/qrLoginFlow';

const isNative =
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

function isOnQrLoginScreen() {
  if (typeof window === 'undefined') return false;
  return /\/qr-login/i.test(window.location.hash || window.location.pathname);
}

/**
 * Pending QR tokens after login; toasts only when not on the QR confirm screen.
 */
export default function QrLoginBridge() {
  const { addNotification } = useNotification();

  useEffect(() => {
    const onQrResult = (e) => {
      if (isOnQrLoginScreen()) return;
      const { success, message } = e.detail || {};
      if (!message) return;
      addNotification(message, success ? 'success' : 'error', success ? 6000 : 5000);
    };

    const onAuthChanged = () => {
      const pending = getPendingQrLoginToken();
      if (!pending) return;
      if (isNative) {
        navigateToQrLoginConfirm(pending);
        return;
      }
      processPendingQrLoginIfAny().catch(() => {});
    };

    window.addEventListener('slide:qr-login-result', onQrResult);
    window.addEventListener('slide:auth-changed', onAuthChanged);

    return () => {
      window.removeEventListener('slide:qr-login-result', onQrResult);
      window.removeEventListener('slide:auth-changed', onAuthChanged);
    };
  }, [addNotification]);

  return null;
}
