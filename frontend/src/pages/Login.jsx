import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { auth } from '../api';
import { checkRateLimit } from '../utils/security';
import MfaCodeInput from '../components/MfaCodeInput';
import AuthShell from '../components/AuthShell';
import AuthBackdrop from '../components/AuthBackdrop';
import { buildQrLoginScanUrl, normalizeQrLoginCheckResponse } from '../utils/qrLoginFlow';
import './Auth.css';

const QR_POLL_INTERVAL = 600;
const QR_POLL_INTERVAL_FAST = 300;
const QR_APPROVED_RETRY_MS = 200;
const QR_APPROVED_RETRY_COUNT = 10;
const QR_EXPIRED_RETRY_COUNT = 6;
const QR_ROTATE_MS = 105 * 1000; // refresh ~15s before 2min server TTL

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(15);
  const [mfaStep, setMfaStep] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [qrToken, setQrToken] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrOffline, setQrOffline] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [qrPhase, setQrPhase] = useState('waiting'); // waiting | success
  const pollRef = useRef(null);
  const rotateRef = useRef(null);
  const rotatingRef = useRef(false);
  const qrSettledRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const qrDataUrlRef = useRef(null);
  const qrTokenRef = useRef(null);
  const lastRotateAtRef = useRef(0);

  useEffect(() => {
    qrTokenRef.current = qrToken;
  }, [qrToken]);

  const stopQrLoops = useCallback(() => {
    qrSettledRef.current = true;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (rotateRef.current) {
      clearInterval(rotateRef.current);
      rotateRef.current = null;
    }
  }, []);
  const { user, login, verify2FA, completeQrLogin, authError, clearAuthError } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAddAccount = searchParams.get('add') === '1';
  const showMfaStep = !!mfaStep;

  useEffect(() => {
    if (authError) {
      setError(authError.message);
      clearAuthError();
    }
  }, [authError, clearAuthError]);

  useEffect(() => {
    if (!mfaStep || loading) return;
    const code = mfaCode.replace(/\D/g, '');
    if (code.length !== 6) return;
    const runVerify = async () => {
      setLoading(true);
      setError('');
      try {
        await verify2FA(mfaStep.tempToken, code);
        navigate('/channels/@me');
      } catch (err) {
        setError(err.message || t('auth.mfaInvalidCode'));
        setMfaCode('');
      } finally {
        setLoading(false);
      }
    };
    runVerify();
  }, [mfaCode, mfaStep, loading, verify2FA, navigate, t]);

  const rotateQrSession = useCallback(async (reason = 'manual') => {
    if (qrSettledRef.current || rotatingRef.current) return null;
    const now = Date.now();
    // Prevent rapid refresh loops (poll + effect races)
    if (reason !== 'initial' && now - lastRotateAtRef.current < 3000) return null;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setQrOffline(true);
      setQrError('Pas de connexion réseau.');
      if (!qrDataUrlRef.current) {
        setQrDataUrl(null);
        setQrToken(null);
      }
      return null;
    }
    rotatingRef.current = true;
    setQrOffline(false);
    setQrError(null);
    try {
      const { token } = await auth.qrLogin.start();
      const url = buildQrLoginScanUrl(token);
      const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
      lastRotateAtRef.current = Date.now();
      qrDataUrlRef.current = dataUrl;
      setQrToken(token);
      setQrDataUrl(dataUrl);
      setQrPhase('waiting');
      return token;
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setQrOffline(offline);
      setQrError(offline ? 'Pas de connexion réseau.' : (err.message || 'Impossible de charger le QR code.'));
      if (!qrDataUrlRef.current) {
        setQrDataUrl(null);
        setQrToken(null);
      }
      return null;
    } finally {
      rotatingRef.current = false;
    }
  }, []);

  const finishQrLogin = useCallback(
    async (user, token) => {
      if (qrSettledRef.current || !user || !token) return;
      stopQrLoops();
      setQrPhase('success');
      try {
        await completeQrLogin(user, token);
        navigate('/channels/@me', { replace: true });
      } catch {
        setQrError('Connexion confirmée mais impossible d’ouvrir la session. Réessayez.');
        qrSettledRef.current = false;
        setQrPhase('waiting');
      }
    },
    [completeQrLogin, navigate, stopQrLoops],
  );

  const tryFinishFromCheck = useCallback(
    async (activeToken, attempt = 0) => {
      const data = normalizeQrLoginCheckResponse(await auth.qrLogin.check(activeToken));
      if (data.status === 'approved' && data.user && data.token) {
        await finishQrLogin(data.user, data.token);
        return true;
      }
      if (data.status === 'approved' && attempt < QR_APPROVED_RETRY_COUNT) {
        await new Promise((r) => setTimeout(r, QR_APPROVED_RETRY_MS));
        if (qrSettledRef.current) return true;
        return tryFinishFromCheck(activeToken, attempt + 1);
      }
      return false;
    },
    [finishQrLogin],
  );

  useEffect(() => {
    if (showMfaStep || !qrToken) return;

    const poll = async () => {
      if (qrSettledRef.current || pollInFlightRef.current) return;
      const activeToken = qrTokenRef.current;
      if (!activeToken) return;
      pollInFlightRef.current = true;
      try {
        const data = normalizeQrLoginCheckResponse(await auth.qrLogin.check(activeToken));
        if (qrSettledRef.current) return;

        if (data.status === 'approved') {
          if (data.user && data.token) {
            await finishQrLogin(data.user, data.token);
            return;
          }
          await tryFinishFromCheck(activeToken, 1);
          return;
        }

        if (data.status === 'expired') {
          // Approval may have just landed — retry before rotating the QR (one-time session).
          for (let i = 0; i < QR_EXPIRED_RETRY_COUNT; i++) {
            await new Promise((r) => setTimeout(r, 200 + i * 120));
            if (qrSettledRef.current) return;
            const retry = normalizeQrLoginCheckResponse(await auth.qrLogin.check(activeToken));
            if (retry.status === 'approved' && retry.user && retry.token) {
              await finishQrLogin(retry.user, retry.token);
              return;
            }
            if (retry.status !== 'expired') break;
          }
          if (qrSettledRef.current) return;
          const last = normalizeQrLoginCheckResponse(await auth.qrLogin.check(activeToken));
          if (last.status === 'expired') {
            await rotateQrSession('expired');
          }
        }
      } catch (err) {
        if (qrSettledRef.current) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setQrOffline(true);
          setQrError('Pas de connexion réseau.');
        } else if (err?.status === 429 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = setInterval(poll, 2500);
        }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    const interval = document.visibilityState === 'visible'
      ? QR_POLL_INTERVAL_FAST
      : QR_POLL_INTERVAL;

    poll();
    pollRef.current = setInterval(poll, interval);

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || qrSettledRef.current) return;
      poll();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(poll, QR_POLL_INTERVAL_FAST);
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [qrToken, showMfaStep, finishQrLogin, tryFinishFromCheck, rotateQrSession, stopQrLoops]);

  // Start QR only when login form is shown — not when rotateQrSession identity changes
  useEffect(() => {
    if (showMfaStep) {
      stopQrLoops();
      return;
    }
    qrSettledRef.current = false;
    pollInFlightRef.current = false;
    lastRotateAtRef.current = 0;
    rotateQrSession('initial');
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [showMfaStep, rotateQrSession, stopQrLoops]);

  useEffect(() => {
    if (showMfaStep || !qrToken) return;
    rotateRef.current = setInterval(() => rotateQrSession('scheduled'), QR_ROTATE_MS);
    return () => {
      if (rotateRef.current) clearInterval(rotateRef.current);
    };
  }, [qrToken, showMfaStep, rotateQrSession]);

  useEffect(() => {
    const onOnline = () => {
      setQrOffline(false);
      if (!showMfaStep) rotateQrSession('online');
    };
    const onOffline = () => {
      setQrOffline(true);
      setQrError('Pas de connexion réseau.');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [showMfaStep, rotateQrSession]); // rotateQrSession is stable ([])

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mfaStep) {
      if (loading) return;
      setLoading(true);
      try {
        await verify2FA(mfaStep.tempToken, mfaCode.replace(/\s/g, ''));
        navigate('/channels/@me');
      } catch (err) {
        setError(err.message || t('auth.mfaInvalidCode'));
        setMfaCode('');
      } finally {
        setLoading(false);
      }
      return;
    }

    const rateCheck = checkRateLimit('login', 15, 120000);
    setRemainingAttempts(rateCheck.remainingAttempts);

    if (!rateCheck.allowed) {
      setError(t('errors.tooManyRequests'));
      return;
    }

    if (!email.trim()) {
      setError(t('errors.invalidEmail'));
      return;
    }

    setLoading(true);
    try {
      const result = await login(email.toLowerCase().trim(), password);
      if (result?.requires2FA && result.tempToken) {
        setMfaStep({ tempToken: result.tempToken, user: result.user });
        setMfaCode('');
        setError('');
      } else {
        navigate('/channels/@me');
      }
    } catch (err) {
      setError(err.message || t('errors.wrongPassword'));
    } finally {
      setLoading(false);
    }
  };

  const mfaUserLabel =
    mfaStep?.user?.email ||
    mfaStep?.user?.username ||
    (email.trim() || null);

  return (
    <AuthShell backgroundMedia={<AuthBackdrop variant="login" />} backdropVariant="login">
      <div className={`auth-card login-card${showMfaStep ? ' login-card--mfa' : ''}`}>
        <div className="login-left">
          <div className="auth-brand">
            <img src="/logo.png" alt="Slide" className="auth-logo" />
            <h2>
              {showMfaStep
                ? t('auth.mfaTitle')
                : isAddAccount
                  ? 'Add account'
                  : t('auth.loginTitle')}
            </h2>
            <p>
              {showMfaStep
                ? t('auth.mfaSubtitle')
                : isAddAccount
                  ? 'Log in with another account to switch between them.'
                  : t('auth.loginSubtitle')}
            </p>
          </div>

          {showMfaStep && mfaUserLabel && (
            <p className="mfa-account-label">{mfaUserLabel}</p>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {!showMfaStep ? (
              <>
                <div className="auth-field">
                  <label className={error ? 'label-error' : ''} htmlFor="login-email">
                    Email ou pseudo
                    {error && <span className="label-required"> *</span>}
                  </label>
                  <input
                    id="login-email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email ou pseudo"
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="auth-field">
                  <label className={error ? 'label-error' : ''} htmlFor="login-password">
                    {t('auth.password')}
                    {error && <span className="label-required"> *</span>}
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe"
                    required
                    autoComplete="current-password"
                  />
                  <Link to="/forgot-password" className="forgot-link" tabIndex={-1}>
                    {t('auth.forgotPassword')}
                  </Link>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? t('common.loading') : t('auth.loginButton')}
                </button>

                {remainingAttempts <= 3 && remainingAttempts > 0 && (
                  <small className="attempts-warning">
                    {remainingAttempts} {t('errors.attemptsRemaining')}
                  </small>
                )}

                {isAddAccount && user && (
                  <div className="auth-switch">
                    <Link to="/channels/@me">Back to app</Link>
                  </div>
                )}

                <div className="auth-switch">
                  <span>{t('auth.noAccount')}</span>{' '}
                  <Link to="/register">{t('auth.registerButton')}</Link>
                </div>
              </>
            ) : (
              <div className="mfa-step-container">
                <div className="auth-field">
                  <label id="mfa-code-label" className={error ? 'label-error' : ''}>
                    {t('auth.mfaCodeLabel')}
                  </label>
                  <MfaCodeInput
                    labelId="mfa-code-label"
                    value={mfaCode}
                    onChange={setMfaCode}
                    autoFocus
                    disabled={loading}
                    hasError={!!error}
                  />
                  <p className="mfa-hint">{t('auth.mfaHint')}</p>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={loading || mfaCode.replace(/\D/g, '').length < 6}
                >
                  {loading ? t('common.loading') : t('auth.verify2FA')}
                </button>

                <button
                  type="button"
                  className="mfa-back-link"
                  disabled={loading}
                  onClick={() => {
                    setMfaStep(null);
                    setMfaCode('');
                    setError('');
                  }}
                >
                  {t('auth.mfaBack')}
                </button>
              </div>
            )}
          </form>
        </div>

        {!showMfaStep && (
          <>
        <div className="login-separator" />

            <div className="login-right">
              <div className="qr-visual">
                <div className={`qr-box${qrPhase === 'success' ? ' qr-box--success' : ''}`}>
                  {qrPhase === 'success' ? (
                    <div className="qr-success-state" aria-live="polite">
                      <div className="qr-success-check" aria-hidden>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <span className="qr-success-label">Code confirmé</span>
                    </div>
                  ) : qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR code for login" className="qr-code-img" width="200" height="200" />
                  ) : qrError ? (
                    <div className="qr-expired">
                      <span>{qrError}</span>
                    </div>
                  ) : (
                    <div className="qr-loading" aria-label="Loading QR code">
                      <span className="qr-loading-dots">...</span>
                    </div>
                  )}
                </div>
              </div>
              <h3 className="qr-title">Log in with QR Code</h3>
              <p className={`qr-description${qrPhase === 'success' ? ' qr-description--success' : ''}`}>
                {qrPhase === 'success'
                  ? 'Connexion en cours… Vous allez être redirigé.'
                  : qrDataUrl
                    ? 'Scannez ce code avec l\'app Slide (connecté avec votre compte) pour vous connecter sur cet appareil.'
                    : qrError
                      ? qrError
                      : 'Chargement du QR code…'}
              </p>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
