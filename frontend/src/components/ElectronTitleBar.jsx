import React, { useState, useEffect } from 'react';
import './ElectronTitleBar.css';

export default function ElectronTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const hasElectron = typeof window !== 'undefined' && !!window.electron;

  useEffect(() => {
    if (!window.electron?.isMaximized) return;
    const update = (v) => {
      if (v !== undefined) {
        setIsMaximized(v);
      } else {
        window.electron.isMaximized().then(val => setIsMaximized(val));
      }
    };
    update(undefined); // initial fetch
    if (window.electron.onMaximizeChange) {
      return window.electron.onMaximizeChange((v) => setIsMaximized(v));
    }
    const iv = setInterval(() => window.electron.isMaximized().then(setIsMaximized), 2000);
    return () => clearInterval(iv);
  }, []);

  const handleMaximize = () => {
    window.electron.maximize();
    setIsMaximized((v) => !v);
  };

  if (!hasElectron) return null;

  const isMac = window.electron?.platform === 'darwin';
  const buttons = (
    <>
      {isMac && (
        <button className="electron-title-bar-btn electron-title-bar-close" onClick={() => window.electron.close()} aria-label="Fermer">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l8 8M9 1L1 9" />
          </svg>
        </button>
      )}
      <button className="electron-title-bar-btn" onClick={() => window.electron.minimize()} aria-label="Réduire">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="0" y="5" width="12" height="1" />
          </svg>
        </button>
        <button className="electron-title-bar-btn" onClick={handleMaximize} aria-label={isMaximized ? 'Restaurer' : 'Agrandir'}>
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2 2v4H0V0h6v2H2zm8 4V2H6V0h6v6h-2zM4 8h4v2H2V6h2v2zm8 0V6h2v6H8v-2h4z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="0.5" y="0.5" width="11" height="11" rx="0.5" />
            </svg>
          )}
        </button>
      {!isMac && (
        <button className="electron-title-bar-btn electron-title-bar-close" onClick={() => window.electron.close()} aria-label="Fermer">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l8 8M9 1L1 9" />
          </svg>
        </button>
      )}
    </>
  );

  return (
    <div className={`electron-title-bar ${isMac ? 'electron-title-bar-mac' : ''}`}>
      {isMac && <div className="electron-title-bar-controls electron-title-bar-controls-left">{buttons}</div>}
      <div className="electron-title-bar-drag" />
      <span className="electron-title-bar-title">Slide</span>
      {!isMac && <div className="electron-title-bar-controls">{buttons}</div>}
    </div>
  );
}
