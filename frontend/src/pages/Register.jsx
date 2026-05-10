import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, X, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { validatePassword, validateDisplayName, isValidEmail, checkRateLimit } from '../utils/security';
import { API_BASE, auth as authApi } from '../api';
import AuthShell from '../components/AuthShell';
import './Auth.css';

// Validate username format (3-32 chars, alphanumeric, underscores, dots)
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
  const [cookiesAccepted, setCookiesAccepted] = useState(false);
  const [showPasswordMismatch, setShowPasswordMismatch] = useState(false);
  const { register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Debounced username availability check
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
      } catch (err) {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  // Password strength indicator
  const passwordValidation = useMemo(() => {
    if (!password) return null;
    return validatePassword(password);
  }, [password]);

  // Show "password mismatch" only after user stops typing for 2s.
  // While typing, hide it so they can correct without constant flashing.
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

    // Client-side rate limiting
    const rateCheck = checkRateLimit('register', 3, 60000);
    if (!rateCheck.allowed) {
      setError(t('errors.tooManyRequests'));
      return;
    }

    // Validate display name
    const nameValidation = validateDisplayName(displayName);
    if (!nameValidation.valid) {
      setError(nameValidation.message);
      return;
    }

    // Validate username
    if (!isValidUsername(username)) {
      setError(t('errors.invalidUsername') || "Nom d'utilisateur invalide (3-32 caractères, lettres, chiffres, _ ou .)");
      return;
    }

    if (usernameAvailable === false) {
      setError(t('errors.usernameTaken') || "Ce nom d'utilisateur est déjà pris");
      return;
    }
    // Note: if usernameAvailable is null (API error), we let the backend handle validation

    // Validate email
    if (!isValidEmail(email)) {
      setError(t('errors.invalidEmail'));
      return;
    }

    // Validate password strength
    if (!passwordValidation?.valid) {
      setError(passwordValidation?.message || t('errors.invalidPassword'));
      return;
    }

    // Confirm password match
    if (password !== confirmPassword) {
      setError(t('errors.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await register(email.toLowerCase().trim(), password, displayName.trim(), username.toLowerCase());
      if (cookiesAccepted) {
        localStorage.setItem('cookie_consent', 'accepted');
        authApi.setFlags({ legal_accepted: true }).catch(() => {});
      }
      navigate('/channels/@me');
    } catch (err) {
      setError(err.message || t('errors.registrationFailed'));
    } finally {
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
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" alt="Slide" className="auth-logo" />
          <h2>{t('auth.createAccount') || 'Create an account'}</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          
          <label>
            {t('auth.displayName')}
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
              placeholder={t('profile.displayNamePlaceholder')}
              maxLength={100}
            />
          </label>

          <label>
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
            <small className="field-hint">{t('auth.usernameHint') || "Utilisé pour vous identifier (ex: @mon_pseudo)"}</small>
          </label>
          
          <label>
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
          
          <label>
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
            {password && passwordValidation && (
              <div className="password-strength">
                <div className="password-strength-bar-container">
                  <div
                    className="password-strength-bar"
                    style={{
                      width: getStrengthWidth(passwordValidation.strength),
                      backgroundColor: getStrengthColor(passwordValidation.strength)
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
          </label>

          <label>
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
          
          <label className="auth-checkbox-label">
            <input
              type="checkbox"
              className="auth-checkbox"
              checked={cookiesAccepted}
              onChange={(e) => setCookiesAccepted(e.target.checked)}
              required
            />
            <span>
              J'accepte les <Link to="/terms">conditions d'utilisation</Link> et la <Link to="/privacy">politique de confidentialité</Link>, et j'autorise l'utilisation de cookies.
            </span>
          </label>

          <button
            type="submit"
            className="auth-submit"
            disabled={loading || checkingUsername || !passwordValidation?.valid || password !== confirmPassword || usernameAvailable === false || !isValidUsername(username) || !cookiesAccepted}
          >
            {loading ? t('common.loading') : t('auth.registerButton')}
          </button>
        </form>

        <div className="auth-security-banner">
          <Lock size={18} strokeWidth={2.5} />
          <span><strong>{t('auth.securityBannerTitle')}</strong> — {t('auth.securityBannerDesc')}</span>
        </div>
        
        <p className="auth-switch">
          {t('auth.hasAccount')} <Link to="/login">{t('auth.loginButton')}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
