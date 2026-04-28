import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './DevelopmentBanner.css';

const LOCAL_KEY = 'slide_dev_banner_accepted';

export default function DevelopmentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Quick local check first — if already dismissed locally, skip API call
    if (localStorage.getItem(LOCAL_KEY)) return;

    // Check server (per-IP tracking)
    fetch('/api/banner/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.dismissed) {
          localStorage.setItem(LOCAL_KEY, 'accepted');
        } else {
          setVisible(true);
        }
      })
      .catch(() => {
        // Server unreachable — fallback to showing banner
        setVisible(true);
      });
  }, []);

  const handleAccept = () => {
    localStorage.setItem(LOCAL_KEY, 'accepted');
    setVisible(false);
    // Notify server so this IP won't see it again
    fetch('/api/banner/dismiss', { method: 'POST' }).catch(() => {});
  };

  if (!visible) return null;

  return (
    <div className="dev-banner" role="status" aria-live="polite">
      <div className="dev-banner-content">
        <p className="dev-banner-text">
          Slide is in active development. Features and legal documents (Privacy Policy, Terms of Service) may be incomplete or subject to change. Use at your own discretion. See{' '}
          <Link to="/privacy" className="dev-banner-link">Privacy</Link> and{' '}
          <Link to="/terms" className="dev-banner-link">Terms</Link>.
        </p>
        <button
          type="button"
          className="dev-banner-accept"
          onClick={handleAccept}
          aria-label="Acknowledge development notice"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
