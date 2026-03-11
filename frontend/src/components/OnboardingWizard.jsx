import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { settings as settingsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import './OnboardingWizard.css';

const STORAGE_KEY = 'slide_onboarding_done';

const STEPS = ['welcome', 'theme', 'discover'];

export default function OnboardingWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const { user } = useAuth();
  const { settings, updateSetting } = useSettings();
  const navigate = useNavigate();

  // Fire confetti on mount (step 0)
  useEffect(() => {
    let cancelled = false;
    import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return;
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.55 },
        colors: ['#4f6ef7', '#7c3aed', '#23a55a', '#f2c94c', '#eb459e'],
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1');
    onClose();
  }, [onClose]);

  const handleThemeSelect = (theme) => {
    setSelectedTheme(theme);
    updateSetting('theme', theme);
    settingsApi.update({ theme }).catch((err) => {
      console.error('Error saving onboarding theme:', err);
    });
  };

  const goNext = () => setStep((s) => s + 1);
  const goBack = () => setStep((s) => s - 1);

  const handleDiscover = () => {
    finish();
    navigate('/community');
  };

  const displayName = user?.display_name || user?.username || 'vous';

  const content = (
    <div className="ow-overlay" role="dialog" aria-modal="true" aria-label="Guide de démarrage">
      <div className="ow-modal">
        {/* Progress bar */}
        <div className="ow-progress">
          <div
            className="ow-progress-fill"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Progress dots */}
        <div className="ow-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <div key={i} className={`ow-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
          ))}
        </div>

        {/* Close button */}
        <button className="ow-close" onClick={finish} aria-label="Fermer">✕</button>

        {/* Steps */}
        <div className={`ow-step ow-step-${step}`} key={step}>
          {step === 0 && (
            <div className="ow-step-content">
              <div className="ow-wave" aria-hidden="true">👋</div>
              <h2 className="ow-title">Bienvenue sur Slide, {displayName} !</h2>
              <p className="ow-desc">Ça prend 30 secondes. On vous guide.</p>
              <div className="ow-actions">
                <button className="ow-btn-primary" onClick={goNext}>Suivant →</button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="ow-step-content">
              <h2 className="ow-title">Choisissez votre ambiance</h2>
              <div className="ow-theme-cards">
                <button
                  className={`ow-theme-card ${selectedTheme === 'light' ? 'selected' : ''}`}
                  onClick={() => handleThemeSelect('light')}
                >
                  <span className="ow-theme-icon">☀️</span>
                  <span className="ow-theme-label">Clair</span>
                  <div className="ow-theme-preview ow-preview-light">
                    <div className="ow-preview-bar" />
                    <div className="ow-preview-body">
                      <div className="ow-preview-sidebar" />
                      <div className="ow-preview-main" />
                    </div>
                  </div>
                </button>
                <button
                  className={`ow-theme-card ${selectedTheme === 'dark' ? 'selected' : ''}`}
                  onClick={() => handleThemeSelect('dark')}
                >
                  <span className="ow-theme-icon">🌙</span>
                  <span className="ow-theme-label">Sombre</span>
                  <div className="ow-theme-preview ow-preview-dark">
                    <div className="ow-preview-bar" />
                    <div className="ow-preview-body">
                      <div className="ow-preview-sidebar" />
                      <div className="ow-preview-main" />
                    </div>
                  </div>
                </button>
              </div>
              <div className="ow-actions ow-actions-row">
                <button className="ow-btn-ghost" onClick={goBack}>← Retour</button>
                <button className="ow-btn-primary" onClick={goNext}>Suivant →</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ow-step-content">
              <h2 className="ow-title">Rejoignez une communauté</h2>
              <p className="ow-desc">Des milliers de serveurs vous attendent.</p>
              <button className="ow-btn-discover" onClick={handleDiscover}>
                🌐 Explorer les serveurs →
              </button>
              <div className="ow-actions ow-actions-row">
                <button className="ow-btn-ghost" onClick={goBack}>← Retour</button>
                <button className="ow-btn-skip" onClick={finish}>Passer cette étape</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
