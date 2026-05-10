import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { auth } from '../api';
import { isValidEmail } from '../utils/security';
import MfaCodeInput from '../components/MfaCodeInput';
import AuthShell from '../components/AuthShell';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaStep, setMfaStep] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();

  const showMfaStep = !!mfaStep;

  // Auto-submit when 6 digits entered for 2FA
  useEffect(() => {
    if (!mfaStep || loading) return;
    const code = mfaCode.replace(/\D/g, '');
    if (code.length !== 6) return;
    const runVerify = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await auth.forgotPasswordVerify2FA(mfaStep.tempToken, code);
        if (data.resetToken) {
          navigate(`/reset-password?token=${encodeURIComponent(data.resetToken)}`, { replace: true });
        }
      } catch (err) {
        setError(err.message || t('auth.mfaInvalidCode'));
        setMfaCode('');
      } finally {
        setLoading(false);
      }
    };
    runVerify();
  }, [mfaCode, mfaStep, loading, navigate, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (showMfaStep) {
      if (loading) return;
      setLoading(true);
      try {
        const data = await auth.forgotPasswordVerify2FA(mfaStep.tempToken, mfaCode.replace(/\s/g, ''));
        if (data.resetToken) {
          navigate(`/reset-password?token=${encodeURIComponent(data.resetToken)}`, { replace: true });
        }
      } catch (err) {
        setError(err.message || t('auth.mfaInvalidCode'));
        setMfaCode('');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!isValidEmail(email)) {
      setError(t('errors.invalidEmail'));
      return;
    }

    setLoading(true);
    try {
      const data = await auth.forgotPassword(email.toLowerCase().trim());
      if (data.requires2FA && data.tempToken) {
        setMfaStep({ tempToken: data.tempToken });
        setMfaCode('');
        setError('');
      } else if (data.emailSent) {
        setEmailSent(true);
        setError('');
      } else {
        setError(t('errors.generic'));
      }
    } catch (err) {
      setError(err.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <img src="/logo.png" alt="Slide" className="auth-logo" />
            <h2>{t('auth.checkInbox')}</h2>
            <p>{t('auth.forgotSuccessMessage')}</p>
          </div>
          <div className="auth-switch" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Link to="/login">{t('auth.backToLogin')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthShell>
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" alt="Slide" className="auth-logo" />
          <h2>{t('auth.forgotPasswordTitle')}</h2>
          <p>
            {showMfaStep
              ? t('auth.mfaSubtitle')
              : t('auth.forgotPasswordSubtitle2FA')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {!showMfaStep ? (
            <>
              <div className="auth-field">
                <label className={error ? 'label-error' : ''} htmlFor="forgot-email">
                  {t('auth.email')}
                  {error && <span className="label-required"> *</span>}
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                />
              </div>
            </>
          ) : (
            <div className="mfa-step-container">
              <div className="auth-field">
                <label className={error ? 'label-error' : ''} htmlFor="forgot-mfa-code">
                  {t('auth.mfaCodeLabel')}
                  {error && <span className="label-required"> *</span>}
                </label>
                <MfaCodeInput
                  id="forgot-mfa-code"
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

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading
              ? t('common.loading')
              : showMfaStep
                ? t('auth.verify2FA')
                : t('auth.continue')}
          </button>

          <div className="auth-switch">
            <Link to="/login">{t('auth.backToLogin')}</Link>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
