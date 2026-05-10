import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { auth } from '../api';
import { checkRateLimit, isValidEmail } from '../utils/security';
import MfaCodeInput from '../components/MfaCodeInput';
import AuthShell from '../components/AuthShell';
import './Auth.css';

const QR_POLL_INTERVAL = 2000;

export default function Login() {
  const [email, setEmail] = useState(''); // holds email or username
  const [password, setPassword] = useState('');
const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(15);
  const [mfaStep, setMfaStep] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [qrToken, setQrToken] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [qrError, setQrError] = useState(null);
  const pollRef = useRef(null);
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

  // Auto-submit when 6 digits entered for 2FA
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

  // QR login: start session and generate QR code
  const startQrSession = useCallback(async () => {
    setQrError(null);
    try {
      const { token } = await auth.qrLogin.start();
      setQrToken(token);
      setQrExpired(false);
      // URL pour le QR : HTTPS si possible (ouvre en navigateur puis redirige), sinon slide://
      let url;
      if (typeof window !== 'undefined') {
        const origin = window.location.origin || '';
        const isHttp = origin.startsWith('http://') || origin.startsWith('https://');
        if (isHttp) {
          const path = window.Capacitor?.isNativePlatform?.() ? '#/qr-login' : '/qr-login';
          url = `${origin}${path}?token=${encodeURIComponent(token)}`;
        } else {
          url = `slide://login?token=${encodeURIComponent(token)}`;
        }
      } else {
        url = `slide://login?token=${encodeURIComponent(token)}`;
      }
      const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
      setQrDataUrl(dataUrl);
      return token;
    } catch (err) {
      setQrDataUrl(null);
      setQrToken(null);
      setQrError(err.message || 'Failed to load QR code');
      return null;
    }
  }, []);

  // QR login: poll for approval
  useEffect(() => {
    if (showMfaStep || !qrToken) return;
    const poll = async () => {
      try {
        const data = await auth.qrLogin.check(qrToken);
        if (data?.status === 'expired') {
          setQrExpired(true);
          setQrToken(null);
          setQrDataUrl(null);
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        if (data?.status === 'approved' && data.user && data.token) {
          if (pollRef.current) clearInterval(pollRef.current);
          await completeQrLogin(data.user, data.token);
          navigate('/channels/@me');
          return;
        }
      } catch {
        // ignore network errors, keep polling
      }
    };
    poll();
    pollRef.current = setInterval(poll, QR_POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [qrToken, showMfaStep, completeQrLogin, navigate]);

  // Start QR session when login form is shown (no MFA step)
  useEffect(() => {
    if (!showMfaStep) {
      startQrSession();
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [showMfaStep]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const rateCheck = checkRateLimit('login', 15, 120000); // 15 tentatives / 2 min (aligné backend)
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

  return (
    <AuthShell
      backgroundMedia={(
        <video
          className="auth-bg-video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        >
          <source src="/bg.mp4" type="video/mp4" />
        </video>
      )}
    >
      <div className="auth-card login-card">
        <div className="login-left">
          <div className="auth-brand">
            <img src="/logo.png" alt="Slide" className="auth-logo" />
            <h2>{showMfaStep ? t('auth.mfaTitle') : isAddAccount ? 'Add account' : t('auth.loginTitle')}</h2>
            <p>{showMfaStep ? t('auth.mfaSubtitle') : isAddAccount ? 'Log in with another account to switch between them.' : t('auth.loginSubtitle')}</p>
          </div>
          
          <form onSubmit={handleSubmit} className="auth-form">
            {!showMfaStep && (
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
              </>
            )}
            {showMfaStep && (
              <div className="mfa-step-container">
                <div className="auth-field">
                  <label className={error ? 'label-error' : ''} htmlFor="mfa-code">
                    {t('auth.mfaCodeLabel')}
                    {error && <span className="label-required"> *</span>}
                  </label>
                  <MfaCodeInput
                    id="mfa-code"
                    value={mfaCode}
                    onChange={setMfaCode}
                    autoFocus
                    hasError={!!error}
                  />
                  <p className="mfa-hint">{t('auth.mfaHint')}</p>
                </div>
                <button
                  type="button"
                  className="mfa-back-link"
                  onClick={() => { setMfaStep(null); setMfaCode(''); setError(''); }}
                >
                  {t('auth.mfaBack')}
                </button>
              </div>
            )}

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
          </form>
        </div>

        <div className="login-separator" />

        <div className="login-right">
          {showMfaStep ? (
            <div className="mfa-right-content">
              <div className="mfa-right-visual">
                <div className="mfa-right-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="M9 12l2 2 4-4"/>
                  </svg>
                </div>
                <div className="mfa-right-pattern" aria-hidden="true" />
              </div>
              <p className="mfa-right-message">{t('auth.mfaRightMessage')}</p>
            </div>
          ) : (
          <>
          <div className="qr-visual">
            <div className="qr-box">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code for login" className="qr-code-img" width="200" height="200" />
              ) : qrExpired ? (
                <div className="qr-expired">
                  <span>Expired</span>
                  <button type="button" className="qr-refresh-btn" onClick={startQrSession}>
                    Refresh
                  </button>
                </div>
              ) : qrError ? (
                <div className="qr-expired">
                  <span>{qrError}</span>
                  <button type="button" className="qr-refresh-btn" onClick={startQrSession}>
                    Retry
                  </button>
                </div>
              ) : (
                <div className="qr-loading" aria-label="Loading QR code">
                  <span className="qr-loading-dots">...</span>
                </div>
              )}
            </div>
          </div>
          <h3 className="qr-title">Log in with QR Code</h3>
          <p className="qr-description">
            {qrDataUrl
              ? 'Scan this with the Slide mobile app to log in instantly.'
              : qrExpired
                ? 'The QR code has expired. Click Refresh to get a new one.'
                : qrError
                  ? 'Could not load QR code. Click Retry.'
                  : 'Loading QR code...'}
          </p>
          </>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
