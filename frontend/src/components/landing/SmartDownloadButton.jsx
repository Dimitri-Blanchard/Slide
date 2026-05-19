import React, { useMemo, useState } from 'react';
import {
  detectDownloadPlatform,
  getPlatformLabel,
  isPlatformDownloadAvailable,
} from '../../utils/detectDownloadPlatform';
import { PlatformIcon } from './PlatformIcons';

function DownloadIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/**
 * Hero / sticky CTA: detects OS, shows its icon, downloads or "coming soon" for Linux.
 */
export default function SmartDownloadButton({
  downloadLinks,
  className = 'btn btn-primary btn-lg hero-download-btn',
  showComingSoonHint = true,
}) {
  const platform = useMemo(() => detectDownloadPlatform(), []);
  const [linuxNotice, setLinuxNotice] = useState(false);
  const available = isPlatformDownloadAvailable(platform);
  const href = platform === 'android' ? downloadLinks.android : downloadLinks.windows;
  const label = getPlatformLabel(platform);

  const trackDownload = () => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'download', { platform });
    }
  };

  const handleLinuxClick = (e) => {
    e.preventDefault();
    setLinuxNotice(true);
    document.getElementById('download')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const linuxCard = document.getElementById('download-linux');
    linuxCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    linuxCard?.classList.add('download-card--highlight');
    window.setTimeout(() => linuxCard?.classList.remove('download-card--highlight'), 2200);
  };

  const content = (
    <>
      <DownloadIcon />
      <span>Download Free</span>
      <PlatformIcon platform={platform} className="platform-os-icon" />
    </>
  );

  if (!available) {
    return (
      <div className="smart-download-wrap">
        <button
          type="button"
          className={className}
          onClick={handleLinuxClick}
          aria-label={`Download for ${label} — coming soon`}
        >
          {content}
        </button>
        {showComingSoonHint && linuxNotice && (
          <p className="smart-download-notice" role="status">
            Linux build is coming soon — stay tuned!
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="smart-download-wrap">
      <a
        href={href}
        className={className}
        rel="noopener noreferrer"
        aria-label={`Download Slide for ${label}`}
        onClick={trackDownload}
      >
        {content}
      </a>
    </div>
  );
}
