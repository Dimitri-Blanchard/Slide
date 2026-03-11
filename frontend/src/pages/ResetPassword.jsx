import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../api';
import { validatePassword } from '../utils/security';
import './Auth.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token');
  const [token, setToken] = useState(tokenFromUrl || '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const effectiveToken = tokenFromUrl || token;
    if (!effectiveToken) {
      setError(t('auth.resetLinkInvalid'));
      return;
    }

    const pwdCheck = validatePassword(newPassword);
    if (!pwdCheck.valid) {
      setError(pwdCheck.message);
      return;
    }

    setLoading(true);
    try {
      const data = await auth.resetPassword(effectiveToken, newPassword);
      if (data.user && data.token) {
        await loginWithToken(data.user, data.token);
        setSuccess(true);
        setTimeout(() => navigate('/channels/@me', { replace: true }), 1500);
      } else {
        setSuccess(true);
        setTimeout(() => navigate('/login', { replace: true }), 2000);
      }
    } catch (err) {
      setError(err.message || t('auth.resetLinkInvalid'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card auth-card-success">
          <div className="auth-success-content">
            <div className="auth-success-icon" aria-hidden>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className="auth-success-title">{t('auth.resetPasswordTitle')}</h2>
            <p className="auth-success-message">{t('auth.resetSuccess')}</p>
            <p className="auth-success-sub">{t('auth.redirectToApp')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tokenFromUrl && !token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <img src="/logo.png" alt="Slide" className="auth-logo" />
            <h2>{t('auth.resetPasswordTitle')}</h2>
            <p className="auth-error">
              {t('auth.resetLinkInvalid')}
            </p>
          </div>
          <Link to="/forgot-password" className="auth-submit" style={{ textDecoration: 'none', textAlign: 'center' }}>
            {t('auth.requestNewLink')}
          </Link>
          <div className="auth-switch">
            <Link to="/login">{t('auth.backToLogin')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" alt="Slide" className="auth-logo" />
          <h2>{t('auth.resetPasswordTitle')}</h2>
          <p>{t('auth.resetPasswordSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {!tokenFromUrl && (
            <div className="auth-field">
              <label htmlFor="reset-token">Token de réinitialisation</label>
              <input
                id="reset-token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Coller le token ici"
              />
            </div>
          )}

          <div className="auth-field">
            <label className={error ? 'label-error' : ''} htmlFor="new-password">
              {t('auth.newPassword')}
              {error && <span className="label-required"> *</span>}
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? t('common.loading') : t('auth.resetButton')}
          </button>

          <div className="auth-switch">
            <Link to="/login">{t('auth.backToLogin')}</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
