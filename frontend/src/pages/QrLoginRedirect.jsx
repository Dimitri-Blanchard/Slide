import React, { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './QrLoginRedirect.css';

const SLIDE_PACKAGE = 'com.slide.messenger';

function getOpenAppUrl(token) {
  if (!token) return null;
  const slideUrl = `slide://login?token=${encodeURIComponent(token)}`;
  // Sur Android, l'URL Intent est plus fiable pour ouvrir l'app depuis Chrome
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    return `intent://login?token=${encodeURIComponent(token)}#Intent;scheme=slide;package=${SLIDE_PACKAGE};end`;
  }
  return slideUrl;
}

/**
 * Page intermédiaire pour la connexion par QR code.
 * Le navigateur bloque souvent les redirections auto vers slide://.
 * Un bouton "Ouvrir" (geste utilisateur) permet de contourner cette limite.
 */
export default function QrLoginRedirect() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const openUrl = getOpenAppUrl(token);

  const handleOpenApp = useCallback(() => {
    if (openUrl) window.location.href = openUrl;
  }, [openUrl]);

  useEffect(() => {
    if (!token) return;
    // Tenter une redirection auto (fonctionne dans certains navigateurs)
    if (openUrl) window.location.href = openUrl;
  }, [token, openUrl]);

  if (!token) {
    return (
      <div className="qr-redirect-page">
        <div className="qr-redirect-fallback">
          <h2>Lien invalide</h2>
          <p>Ce lien est expiré ou invalide. Scannez à nouveau le QR code.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="qr-redirect-page">
      <div className="qr-redirect-fallback">
        <h2>Ouvrir dans Slide</h2>
        <p className="qr-redirect-desc">
          Appuyez sur le bouton ci-dessous pour ouvrir Slide et confirmer la connexion.
        </p>
        <button type="button" className="qr-redirect-btn" onClick={handleOpenApp}>
          Ouvrir Slide
        </button>
        <p className="qr-redirect-hint">
          Si l'app ne s'ouvre pas, vérifiez qu'elle est bien installée.
        </p>
      </div>
    </div>
  );
}
