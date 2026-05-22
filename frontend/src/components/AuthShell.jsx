import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAppHomePath } from '../hooks/useAppHomePath';
import { isClientApp } from '../utils/clientApp';
import './AuthShell.css';

/**
 * Shared chrome for auth and legal surfaces (logo header, footer links, optional backdrop).
 */
export default function AuthShell({
  children,
  backgroundMedia = null,
  backdropVariant = 'register',
  variant = 'auth',
  legalTitle = '',
  legalBackTo,
  legalBackLabel = 'Back to Home',
}) {
  const { t } = useLanguage();
  const appHome = useAppHomePath();
  const homeTo = legalBackTo ?? appHome;
  const BrandTag = isClientApp() ? 'div' : Link;
  const brandProps = isClientApp()
    ? { className: 'auth-shell-brand' }
    : { to: appHome, className: 'auth-shell-brand' };

  if (variant === 'legal') {
    return (
      <div className="auth-shell auth-shell--legal">
        <header className="auth-shell-header auth-shell-header--legal-row">
          <BrandTag {...brandProps}>
            <img src="/logo.png" alt="" width={32} height={32} className="auth-shell-logo" />
            <span className="auth-shell-brand-text">{legalTitle}</span>
          </BrandTag>
          <Link to={homeTo} className="legal-back-link">{legalBackLabel}</Link>
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
    <div
      className={`auth-shell${backgroundMedia ? ' auth-shell--backdrop' : ''}${
        backgroundMedia && backdropVariant === 'login' ? ' auth-shell--backdrop-login' : ''
      }`}
    >
      {backgroundMedia}
      <header className="auth-shell-header">
        <BrandTag {...brandProps}>
          <img src="/logo.png" alt="" width={28} height={28} className="auth-shell-logo" />
          <span className="auth-shell-brand-text">Slide</span>
        </BrandTag>
      </header>
      <main className={`auth-shell-main${backgroundMedia ? ' auth-shell-main--backdrop' : ''}`}>{children}</main>
      <footer className="auth-shell-footer" aria-label="Legal links">
        <Link to="/privacy">{t('legal.privacyLink')}</Link>
        <span className="auth-shell-footer-sep" aria-hidden>·</span>
        <Link to="/terms">{t('legal.termsLink')}</Link>
      </footer>
    </div>
  );
}
