import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, X, Lock, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { validatePassword, validateDisplayName, isValidEmail, checkRateLimit } from '../utils/security';
import { API_BASE, auth as authApi } from '../api';
import AuthShell from '../components/AuthShell';
import AuthBackdrop from '../components/AuthBackdrop';
import { isClientApp } from '../utils/clientApp';
import './Auth.css';

function fireRegisterConfetti() {
  const colors = ['#4f6ef7', '#22c55e', '#f59e0b', '#ec4899', '#a78bfa', '#FEE75C'];
  const defaults = { origin: { y: 0.55 }, zIndex: 9999 };

  confetti({ ...defaults, particleCount: 120, spread: 80, colors });
  confetti({
    ...defaults,
    particleCount: 40,
    spread: 110,
    scalar: 1.3,
    shapes: ['circle'],
    colors: ['#a78bfa', '#c4b5fd', '#FEE75C'],
  });

  setTimeout(() => {
    confetti({ ...defaults, particleCount: 70, angle: 60, spread: 70, origin: { x: 0, y: 0.65 }, colors });
    confetti({ ...defaults, particleCount: 70, angle: 120, spread: 70, origin: { x: 1, y: 0.65 }, colors });
  }, 180);

  setTimeout(() => {
    confetti({ ...defaults, particleCount: 90, spread: 100, startVelocity: 35, decay: 0.9, colors });
  }, 400);
}

function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const usernameRegex = /^[a-zA-Z0-9_\.]{3,32}$/;
  return usernameRegex.test(username);
}

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPasswordMismatch, setShowPasswordMismatch] = useState(false);
  const { register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    if (!isValidUsername(username)) {
      setUsernameAvailable(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const res = await fetch(`${API_BASE}/auth/check-username/${encodeURIComponent(username)}`);
        const data = await res.json();
        setUsernameAvailable(data.available);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  const passwordValidation = useMemo(() => {
    if (!password) return null;
    return validatePassword(password);
  }, [password]);

  useEffect(() => {
    setShowPasswordMismatch(false);
    if (!confirmPassword) return;

    const mismatchTimer = setTimeout(() => {
      setShowPasswordMismatch(password !== confirmPassword);
    }, 2000);

    return () => clearTimeout(mismatchTimer);
  }, [password, confirmPassword]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const rateCheck = checkRateLimit('register', 3, 60000);
    if (!rateCheck.allowed) {
      setError(t('errors.tooManyRequests'));
      return;
    }

    const nameValidation = validateDisplayName(displayName);
    if (!nameValidation.valid) {
      setError(nameValidation.message);
      return;
    }

    if (!isValidUsername(username)) {
      setError(t('errors.invalidUsername') || "Nom d'utilisateur invalide (3-32 caractères, lettres, chiffres, _ ou .)");
      return;
    }

    if (usernameAvailable === false) {
      setError(t('errors.usernameTaken') || "Ce nom d'utilisateur est déjà pris");
      return;
    }

    if (!isValidEmail(email)) {
      setError(t('errors.invalidEmail'));
      return;
    }

    if (!passwordValidation?.valid) {
      setError(passwordValidation?.message || t('errors.invalidPassword'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('errors.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await register(email.toLowerCase().trim(), password, displayName.trim(), username.toLowerCase());
      if (termsAccepted) {
        authApi.setFlags({ legal_accepted: true }).catch(() => {});
      }
      setCelebrating(true);
      fireRegisterConfetti();
      setTimeout(() => navigate('/channels/@me'), 2400);
    } catch (err) {
      setError(err.message || t('errors.registrationFailed'));
      setLoading(false);
    }
  };

  const getStrengthColor = (strength) => {
    switch (strength) {
      case 'weak': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'strong': return '#22c55e';
      case 'very-strong': return '#059669';
      default: return '#6b7280';
    }
  };

  const getStrengthWidth = (strength) => {
    switch (strength) {
      case 'weak': return '25%';
      case 'medium': return '50%';
      case 'strong': return '75%';
      case 'very-strong': return '100%';
      default: return '0%';
    }
  };

  const getStrengthLabel = (strength) => {
    switch (strength) {
      case 'weak': return t('account.passwordStrength.weak');
      case 'medium': return t('account.passwordStrength.medium');
      case 'strong': return t('account.passwordStrength.strong');
      case 'very-strong': return t('account.passwordStrength.veryStrong') || 'Très fort';
      default: return '';
    }
  };

  return (
    <AuthShell backgroundMedia={isClientApp() ? null : <AuthBackdrop />}>
      <div className={`auth-card register-card${celebrating ? ' register-card--celebrating' : ''}`}>
        {celebrating ? (
          <div className="register-celebration" role="status" aria-live="polite">
            <div className="register-celebration-icon" aria-hidden>
              <CheckCircle2 size={56} strokeWidth={2} />
            </div>
            <h2>{t('auth.registerSuccess')}</h2>
            <p>{t('auth.registerSuccessSub')}</p>
          </div>
        ) : (
          <>
            <div className="register-card-header auth-brand">
              <img src="/logo.png" alt="Slide" className="auth-logo" />
              <h2>{t('auth.createAccount') || 'Create an account'}</h2>
            </div>

            <form onSubmit={handleSubmit} className="auth-form auth-form--register">
              {error && <div className="auth-error register-form-full">{error}</div>}

              <div className="register-form-fields">
                <label className="register-field">
                  {t('auth.displayName')}
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder={t('auth.displayNamePlaceholder')}
                    maxLength={100}
                  />
                </label>

                <label className="register-field">
                  {t('auth.username') || "Nom d'utilisateur"}
                  <div className="input-with-prefix">
                    <span className="input-prefix">@</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_\.]/g, ''))}
                      required
                      autoComplete="username"
                      placeholder="mon_pseudo"
                      maxLength={32}
                      className={username.length >= 3 ? (usernameAvailable === true ? 'input-valid' : usernameAvailable === false ? 'input-invalid' : '') : ''}
                    />
                  </div>
                  {username.length >= 3 && (
                    <small className={`username-status ${checkingUsername ? 'checking' : usernameAvailable === true ? 'available' : usernameAvailable === false ? 'taken' : ''}`}>
                      {checkingUsername ? (t('auth.checkingUsername') || 'Vérification...') :
                        usernameAvailable === true ? <><Check size={14} /> {t('auth.usernameAvailable') || 'Disponible'}</> :
                          usernameAvailable === false ? <><X size={14} /> {t('auth.usernameTaken') || 'Déjà pris'}</> : ''}
                    </small>
                  )}
                </label>

                <label className="register-field register-field--full">
                  {t('auth.email')}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="email@example.com"
                    maxLength={255}
                  />
                </label>

                <div className="register-form-row register-form-row--split">
                  <label className="register-field">
                    {t('auth.password')}
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setShowPasswordMismatch(false);
                      }}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                  </label>

                  <label className="register-field">
                    {t('auth.confirmPassword')}
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setShowPasswordMismatch(false);
                      }}
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                    {showPasswordMismatch && (
                      <small className="password-mismatch">{t('errors.passwordMismatch')}</small>
                    )}
                  </label>
                </div>

                {password ? (
                  <div className="register-password-meta register-field--full">
                    {passwordValidation && (
                      <div className="password-strength">
                        <div className="password-strength-bar-container">
                          <div
                            className="password-strength-bar"
                            style={{
                              width: getStrengthWidth(passwordValidation.strength),
                              backgroundColor: getStrengthColor(passwordValidation.strength),
                            }}
                          />
                        </div>
                        <span className={`password-strength-text ${passwordValidation.strength}`}>
                          {getStrengthLabel(passwordValidation.strength)}
                        </span>
                      </div>
                    )}
                    <small className="password-requirements">
                      {t('auth.passwordRequirements')}
                    </small>
                  </div>
                ) : null}
              </div>

              <label className="auth-checkbox-label register-form-full">
                <input
                  type="checkbox"
                  className="auth-checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  required
                />
                <span>
                  J'accepte les <Link to="/terms">conditions d'utilisation</Link> et la <Link to="/privacy">politique de confidentialité</Link>.
                </span>
              </label>

              <button
                type="submit"
                className="auth-submit register-form-full"
                disabled={loading || checkingUsername || !passwordValidation?.valid || password !== confirmPassword || usernameAvailable === false || !isValidUsername(username) || !termsAccepted}
              >
                {loading ? t('common.loading') : t('auth.registerButton')}
              </button>
            </form>
          </>
        )}

        <div className="register-card-footer">
          {!celebrating && (
            <div className="auth-security-banner">
              <Lock size={18} strokeWidth={2.5} />
              <span><strong>{t('auth.securityBannerTitle')}</strong> — {t('auth.securityBannerDesc')}</span>
            </div>
          )}

          {!celebrating && (
            <p className="auth-switch">
              {t('auth.hasAccount')} <Link to="/login">{t('auth.loginButton')}</Link>
            </p>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
