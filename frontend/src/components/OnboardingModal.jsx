import React from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../api';
import { Lock, CheckCircle } from 'lucide-react';
import './OnboardingModal.css';

const STORAGE_KEY = 'slide_onboarding_seen';

export function hasSeenOnboarding(user) {
  // Server-side flag takes priority
  if (user?.onboarding_seen) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setOnboardingSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}

export default function OnboardingModal({ onClose }) {
  const { t } = useLanguage();
  const { user } = useAuth();

  const handleGotIt = () => {
    setOnboardingSeen();
    // Persist to server if logged in
    if (user) {
      authApi.setFlags({ onboarding_seen: true }).catch(() => {});
    }
    onClose?.();
  };

  const modal = (
    <div className="onboarding-overlay" onClick={handleGotIt}>
      <div className="onboarding-modal" onClick={e => e.stopPropagation()}>
        <div className="onboarding-icon-wrap">
          <Lock size={48} strokeWidth={1.5} />
        </div>
        <h1 className="onboarding-headline">{t('onboarding.headline')}</h1>
        <p className="onboarding-subtext">{t('onboarding.subtext')}</p>
        <ul className="onboarding-bullets">
          <li><CheckCircle size={18} /><span>{t('onboarding.bulletE2EE')}</span></li>
          <li><CheckCircle size={18} /><span>{t('onboarding.bulletZeroLogs')}</span></li>
          <li><CheckCircle size={18} /><span>{t('onboarding.bulletAudited')}</span></li>
          <li><CheckCircle size={18} /><span>{t('onboarding.bulletNitro')}</span></li>
        </ul>
        <button className="onboarding-cta" onClick={handleGotIt}>
          {t('onboarding.gotIt')}
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
