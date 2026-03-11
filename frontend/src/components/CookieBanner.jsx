import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../api';
import './CookieBanner.css';

const STORAGE_KEY = 'cookie_consent';

export default function CookieBanner() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // If logged in and server says legal/cookie consent already accepted → never show
    if (user?.legal_accepted || user?.cookies_accepted) {
      setVisible(false);
      return;
    }
    // Otherwise rely on localStorage
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, [user]);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setVisible(false);
    // Persist to server if logged in (so it never shows on any device)
    if (user) {
      // Keep legacy key for backward compatibility with older backends
      authApi.setFlags({ legal_accepted: true, cookies_accepted: true }).catch(() => {});
    }
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label={t('legal.cookieTitle')}>
      <div className="cookie-banner-content">
        <p className="cookie-banner-text">
          {t('legal.cookieMessage')}{' '}
          <Link to="/privacy" className="cookie-banner-link" onClick={handleAccept}>
            {t('legal.privacyLink')}
          </Link>
        </p>
        <button
          type="button"
          className="cookie-banner-accept"
          onClick={handleAccept}
          aria-label={t('legal.cookieAccept')}
        >
          {t('legal.cookieAccept')}
        </button>
      </div>
    </div>
  );
}
