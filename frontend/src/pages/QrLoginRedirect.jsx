import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  approveQrLoginSession,
  buildDesktopBrowserAuthCancelUrl,
  buildDesktopBrowserAuthCallbackUrl,
  buildOpenSlideAppUrl,
  extractQrTokenFromUrl,
  openSlideApp,
  savePendingQrLoginToken,
} from '../utils/qrLoginFlow';
import { getRefreshToken, getToken } from '../utils/tokenStorage';
import './QrLoginRedirect.css';

function closeBrowserHandoffPage() {
  try {
    window.close();
  } catch (_) {
    // Some browsers only allow closing script-opened tabs.
  }
}

export default function QrLoginRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || extractQrTokenFromUrl(window.location.href);
  const isDesktopBrowserHandoff = searchParams.get('source') === 'desktop';
  const isDirectBrowserHandoff = isDesktopBrowserHandoff && searchParams.get('handoff') === 'direct';
  const targetDevice = {
    deviceId: searchParams.get('deviceId') || null,
    deviceName: searchParams.get('deviceName') || null,
  };
  const fallbackPageUrl =
    typeof window !== 'undefined' && token
      ? `${window.location.origin}/qr-login?token=${encodeURIComponent(token)}`
      : null;
  const openUrl = buildOpenSlideAppUrl(token, fallbackPageUrl);
  const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
  const [status, setStatus] = useState(() => {
    if (!token && !isDirectBrowserHandoff) return 'invalid';
    if (isNative || getToken()) return 'approving';
    if (isDirectBrowserHandoff) return 'closing';
    if (isDesktopBrowserHandoff) return 'need-login';
    return 'redirect';
  });
  const [errorMessage, setErrorMessage] = useState('');

  const runApprove = useCallback(async () => {
    if (!token && !isDirectBrowserHandoff) return;
    setStatus('approving');
    setErrorMessage('');
    try {
      if (!getToken()) {
        if (isDirectBrowserHandoff) {
          window.location.href = buildDesktopBrowserAuthCancelUrl('not_logged_in');
          setStatus('closing');
          setTimeout(closeBrowserHandoffPage, 500);
          return;
        }
        if (token) savePendingQrLoginToken(token, targetDevice);
        setStatus('need-login');
        return;
      }
      if (isDirectBrowserHandoff) {
        const callbackUrl = buildDesktopBrowserAuthCallbackUrl({
          token: getToken(),
          refreshToken: await getRefreshToken(),
        });
        if (!callbackUrl) throw new Error('Session navigateur introuvable.');
        window.location.href = callbackUrl;
        setStatus('success');
        return;
      }
      await approveQrLoginSession(token, targetDevice);
      setStatus('success');
    } catch (err) {
      if (err?.message === 'NOT_LOGGED_IN') {
        if (token) savePendingQrLoginToken(token, targetDevice);
        setStatus('need-login');
        return;
      }
      setErrorMessage(err?.message || 'Impossible de confirmer la connexion.');
      setStatus('error');
    }
  }, [isDirectBrowserHandoff, token, targetDevice.deviceId, targetDevice.deviceName]);

  useEffect(() => {
    if (!token && !isDirectBrowserHandoff) return;
    if (isNative || getToken()) {
      runApprove();
      return;
    }
    if (isDirectBrowserHandoff) {
      window.location.href = buildDesktopBrowserAuthCancelUrl('not_logged_in');
      setStatus('closing');
      setTimeout(closeBrowserHandoffPage, 500);
      return;
    }
    if (isDesktopBrowserHandoff) {
      savePendingQrLoginToken(token, targetDevice);
      setStatus('need-login');
      return;
    }
    const timer = setTimeout(() => {
      openSlideApp(token, fallbackPageUrl);
    }, 1200);
    return () => clearTimeout(timer);
  }, [token, fallbackPageUrl, isNative, isDesktopBrowserHandoff, isDirectBrowserHandoff, runApprove]);

  useEffect(() => {
    if (status !== 'success' || !isNative) return;
    const timer = setTimeout(() => {
      navigate('/channels/@me', { replace: true });
    }, 1400);
    return () => clearTimeout(timer);
  }, [status, isNative, navigate]);

  const handleContinue = () => {
    if (status === 'success') {
      navigate('/channels/@me', { replace: true });
      return;
    }
    if (status === 'need-login') {
      const redirect = isDirectBrowserHandoff
        ? `/qr-login?${searchParams.toString()}`
        : '/login';
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true });
      return;
    }
    if (status === 'error') {
      runApprove();
    }
  };

  const handleOpenApp = () => {
    openSlideApp(token, fallbackPageUrl);
  };

  return (
    <div className="qr-confirm-page">
      <div className="qr-confirm-card">
        {status === 'approving' && (
          <div className="qr-confirm-state qr-confirm-state--loading" key="loading">
            <div className="qr-confirm-ring" aria-hidden>
              <div className="qr-confirm-ring-inner" />
            </div>
            <h1>Connexion en cours</h1>
            <p>Validation du code QR pour votre ordinateur…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="qr-confirm-state qr-confirm-state--success" key="success">
            <div className="qr-confirm-icon qr-confirm-icon--success" aria-hidden>
              <svg viewBox="0 0 52 52" className="qr-confirm-check-svg">
                <circle className="qr-confirm-check-circle" cx="26" cy="26" r="24" fill="none" />
                <path className="qr-confirm-check-mark" fill="none" d="M14 27l8 8 16-18" />
              </svg>
            </div>
            <h1>Ça a marché !</h1>
            <p>Votre ordinateur est connecté.</p>
            {isNative ? (
              <p className="qr-confirm-hint">Retour à Slide…</p>
            ) : (
              <button type="button" className="qr-confirm-btn" onClick={handleContinue}>
                Continuer
              </button>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="qr-confirm-state qr-confirm-state--error" key="error">
            <div className="qr-confirm-icon qr-confirm-icon--error" aria-hidden>
              <svg viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2" />
                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M18 18l16 16M34 18L18 34" />
              </svg>
            </div>
            <h1>Échec</h1>
            <p>{errorMessage || 'Le code QR a peut-être expiré. Scannez-en un nouveau sur votre ordinateur.'}</p>
            {isNative || getToken() ? (
              <button type="button" className="qr-confirm-btn" onClick={handleContinue}>
                Réessayer
              </button>
            ) : (
              openUrl && (
                <button type="button" className="qr-confirm-btn" onClick={handleOpenApp}>
                  Ouvrir Slide
                </button>
              )
            )}
          </div>
        )}

        {status === 'need-login' && (
          <div className="qr-confirm-state qr-confirm-state--warn" key="need-login">
            <div className="qr-confirm-icon qr-confirm-icon--warn" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h1>{isDesktopBrowserHandoff ? 'Connectez-vous dans le navigateur' : 'Connectez-vous'}</h1>
            <p>
              {isDirectBrowserHandoff
                ? 'Connectez-vous ici avec votre compte Slide. Cette page renverra ensuite la session à l’application desktop.'
                : isDesktopBrowserHandoff
                ? 'Connectez-vous ici avec votre compte Slide, puis la connexion sera envoyée automatiquement à l’application desktop.'
                : 'Connectez-vous dans Slide avec votre compte, puis scannez à nouveau le QR code.'}
            </p>
            <button type="button" className="qr-confirm-btn" onClick={handleContinue}>
              Se connecter
            </button>
          </div>
        )}

        {status === 'invalid' && (
          <div className="qr-confirm-state qr-confirm-state--error" key="invalid">
            <div className="qr-confirm-icon qr-confirm-icon--error" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <h1>Lien invalide</h1>
            <p>Le lien de connexion n&apos;est plus valide. Relancez la connexion depuis l&apos;application Slide.</p>
          </div>
        )}

        {status === 'closing' && (
          <div className="qr-confirm-state qr-confirm-state--loading" key="closing">
            <div className="qr-confirm-ring" aria-hidden>
              <div className="qr-confirm-ring-inner" />
            </div>
            <h1>Retour à l&apos;application</h1>
            <p>Connectez-vous directement dans l&apos;application Slide.</p>
          </div>
        )}

        {status === 'redirect' && (
          <div className="qr-confirm-state qr-confirm-state--loading" key="redirect">
            <div className="qr-confirm-ring" aria-hidden>
              <div className="qr-confirm-ring-inner" />
            </div>
            <h1>Ouvrir Slide</h1>
            <p>
              Confirmez la connexion dans l&apos;application Slide installée sur votre téléphone.
              Si rien ne s&apos;ouvre, appuyez sur le bouton ci-dessous.
            </p>
            {openUrl && (
              <button type="button" className="qr-confirm-btn qr-confirm-btn--secondary" onClick={handleOpenApp}>
                Ouvrir Slide
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
