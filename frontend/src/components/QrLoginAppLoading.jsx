import React from 'react';
import './QrLoginAppLoading.css';

/** Post–QR-login loading screen (desktop browser). */
export default function QrLoginAppLoading({ step = 'Préparation…', title = 'Chargement de Slide' }) {
  return (
    <div className="qr-app-loading" role="status" aria-live="polite">
      <div className="qr-app-load-logo-wrap" aria-hidden>
        <img src="/logo.png" alt="" className="qr-app-load-logo" />
        <div className="qr-app-load-ring" />
      </div>
      <h2 className="qr-app-loading-title">{title}</h2>
      <p className="qr-app-load-step">{step}</p>
      <div className="qr-app-load-bar" aria-hidden>
        <div className="qr-app-load-bar-fill" />
      </div>
    </div>
  );
}
