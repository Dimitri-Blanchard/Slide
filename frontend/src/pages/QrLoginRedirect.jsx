import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  approveQrLoginSession,
  extractQrTokenFromUrl,
  prefetchSlideAppData,
  savePendingQrLoginToken,
} from '../utils/qrLoginFlow';
import { getToken } from '../utils/tokenStorage';
import './QrLoginRedirect.css';

const SLIDE_PACKAGE = 'com.slide.messenger';

function getOpenAppUrl(token) {
  if (!token) return null;
  const slideUrl = `slide://login?token=${encodeURIComponent(token)}`;
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    return `intent://login?token=${encodeURIComponent(token)}#Intent;scheme=slide;package=${SLIDE_PACKAGE};end`;
  }
  return slideUrl;
}

export default function QrLoginRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || extractQrTokenFromUrl(window.location.href);
  const openUrl = getOpenAppUrl(token);
  const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
  const [status, setStatus] = useState(() => {
    if (!token) return 'invalid';
    if (isNative || getToken()) return 'approving';
    return 'redirect';
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [loadStep, setLoadStep] = useState('Préparation…');

  const runLoadingAndEnter = useCallback(async () => {
    setStatus('loading-app');
    try {
      await prefetchSlideAppData(setLoadStep);
    } catch {
      /* still navigate */
    }
    navigate('/channels/@me', { replace: true });
  }, [navigate]);

  const runApprove = useCallback(async () => {
    if (!token) return;
    setStatus('approving');
    setErrorMessage('');
    try {
      if (!getToken()) {
        savePendingQrLoginToken(token);
        setStatus('need-login');
        return;
      }
      await approveQrLoginSession(token);
      setStatus('success');
    } catch (err) {
      if (err?.message === 'NOT_LOGGED_IN') {
        savePendingQrLoginToken(token);
        setStatus('need-login');
        return;
      }
      setErrorMessage(err?.message || 'Impossible de confirmer la connexion.');
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (isNative || getToken()) {
      runApprove();
      return;
    }
    const timer = setTimeout(() => {
      if (openUrl) window.location.href = openUrl;
    }, 1500);
    return () => clearTimeout(timer);
  }, [token, openUrl, isNative, runApprove]);

  useEffect(() => {
    if (status !== 'success' || !isNative) return;
    const timer = setTimeout(() => {
      runLoadingAndEnter();
    }, 1600);
    return () => clearTimeout(timer);
  }, [status, isNative, runLoadingAndEnter]);

  const handleContinue = () => {
    if (status === 'success') {
      if (isNative) {
        runLoadingAndEnter();
      } else {
        navigate('/channels/@me', { replace: true });
      }
      return;
    }
    if (status === 'need-login') {
      navigate('/login', { replace: true });
      return;
    }
    if (status === 'error') {
      runApprove();
    }
  };

  const handleOpenApp = () => {
    if (openUrl) window.location.href = openUrl;
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
            <p>Votre ordinateur est connecté. Chargement de Slide dans un instant…</p>
            {isNative && (
              <button type="button" className="qr-confirm-btn" onClick={handleContinue}>
                Continuer
              </button>
            )}
          </div>
        )}

        {status === 'loading-app' && (
          <div className="qr-confirm-state qr-confirm-state--loading-app" key="loading-app">
            <div className="qr-app-load-logo-wrap" aria-hidden>
              <img src="/logo.png" alt="" className="qr-app-load-logo" />
              <div className="qr-app-load-ring" />
            </div>
            <h1>Chargement de Slide</h1>
            <p className="qr-app-load-step">{loadStep}</p>
            <div className="qr-app-load-bar" aria-hidden>
              <div className="qr-app-load-bar-fill" />
            </div>
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
            <h1>Connectez-vous</h1>
            <p>Connectez-vous dans Slide avec votre compte, puis scannez à nouveau le QR code.</p>
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
            <p>Scannez à nouveau le QR code affiché sur votre ordinateur.</p>
          </div>
        )}

        {status === 'redirect' && (
          <div className="qr-confirm-state qr-confirm-state--loading" key="redirect">
            <div className="qr-confirm-ring" aria-hidden>
              <div className="qr-confirm-ring-inner" />
            </div>
            <h1>Ouverture de Slide</h1>
            <p>Redirection vers l&apos;application…</p>
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
