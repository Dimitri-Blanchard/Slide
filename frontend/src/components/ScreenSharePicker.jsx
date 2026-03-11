import React from 'react';
import { useVoice } from '../context/VoiceContext';
import './ScreenSharePicker.css';

export default function ScreenSharePicker() {
  const { screenSharePicker, resolveScreenSharePicker } = useVoice();

  if (!screenSharePicker?.visible) return null;

  const { sources } = screenSharePicker;
  const screens = sources.filter(s => s.id.startsWith('screen:'));
  const windows = sources.filter(s => !s.id.startsWith('screen:'));

  return (
    <div className="ssp-overlay" onClick={() => resolveScreenSharePicker(null)}>
      <div className="ssp-modal" onClick={e => e.stopPropagation()}>
        <div className="ssp-header">
          <h3 className="ssp-title">Partager votre écran</h3>
          <button className="ssp-close-btn" onClick={() => resolveScreenSharePicker(null)} aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        <div className="ssp-body">
          {screens.length > 0 && (
            <section className="ssp-section">
              <h4 className="ssp-section-title">Écrans entiers</h4>
              <div className="ssp-grid">
                {screens.map(s => (
                  <button key={s.id} className="ssp-source-btn" onClick={() => resolveScreenSharePicker(s.id)}>
                    <div className="ssp-thumb-wrap">
                      <img src={s.thumbnail} alt={s.name} className="ssp-thumb" />
                    </div>
                    <span className="ssp-source-name">{s.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {windows.length > 0 && (
            <section className="ssp-section">
              <h4 className="ssp-section-title">Fenêtres d'application</h4>
              <div className="ssp-grid">
                {windows.map(s => (
                  <button key={s.id} className="ssp-source-btn" onClick={() => resolveScreenSharePicker(s.id)}>
                    <div className="ssp-thumb-wrap">
                      <img src={s.thumbnail} alt={s.name} className="ssp-thumb" />
                      {s.appIcon && (
                        <img src={s.appIcon} alt="" className="ssp-app-icon" aria-hidden="true" />
                      )}
                    </div>
                    <span className="ssp-source-name">{s.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {sources.length === 0 && (
            <p className="ssp-empty">Aucune source disponible.</p>
          )}
        </div>

        <div className="ssp-footer">
          <button className="ssp-cancel-btn" onClick={() => resolveScreenSharePicker(null)}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
