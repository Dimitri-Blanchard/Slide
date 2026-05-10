import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './AuthShell.css';

/**
 * Shared chrome for auth and legal surfaces (logo header, footer links, optional video).
 */
export default function AuthShell({
  children,
  backgroundMedia = null,
  variant = 'auth',
  legalTitle = '',
  legalBackTo = '/',
  legalBackLabel = 'Back to Home',
}) {
  const { t } = useLanguage();

  if (variant === 'legal') {
    return (
      <div className="auth-shell auth-shell--legal">
        <header className="auth-shell-header auth-shell-header--legal-row">
          <Link to="/" className="auth-shell-brand">
            <img src="/logo.png" alt="" width={32} height={32} className="auth-shell-logo" />
            <span className="auth-shell-brand-text">{legalTitle}</span>
          </Link>
          <Link to={legalBackTo} className="legal-back-link">{legalBackLabel}</Link>
        </header>
        <div className="auth-shell-legal-scroll">{children}</div>
        <footer className="auth-shell-footer" aria-label="Legal links">
          <Link to="/privacy">{t('legal.privacyLink')}</Link>
          <span className="auth-shell-footer-sep" aria-hidden>·</span>
          <Link to="/terms">{t('legal.termsLink')}</Link>
        </footer>
      </div>
    );
  }

  return (
    <div className={`auth-shell${backgroundMedia ? ' auth-shell--has-media' : ''}`}>
      {backgroundMedia}
      <header className="auth-shell-header">
        <Link to="/" className="auth-shell-brand">
          <img src="/logo.png" alt="" width={28} height={28} className="auth-shell-logo" />
          <span className="auth-shell-brand-text">Slide</span>
        </Link>
      </header>
      <main className="auth-shell-main">{children}</main>
      <footer className="auth-shell-footer" aria-label="Legal links">
        <Link to="/privacy">{t('legal.privacyLink')}</Link>
        <span className="auth-shell-footer-sep" aria-hidden>·</span>
        <Link to="/terms">{t('legal.termsLink')}</Link>
      </footer>
    </div>
  );
}
