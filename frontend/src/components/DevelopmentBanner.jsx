import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './DevelopmentBanner.css';

const STORAGE_KEY = 'slide_dev_banner_accepted';

export default function DevelopmentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setVisible(false);
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
