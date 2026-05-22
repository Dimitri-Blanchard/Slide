import React, { useMemo } from 'react';
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

function getDownloadHref(platform, downloadLinks) {
  if (platform === 'android') return downloadLinks.android;
  if (platform === 'linux') return downloadLinks.linux;
  return downloadLinks.windows;
}

/**
 * Hero / sticky CTA: detects OS, shows its icon, links to the matching installer.
 */
export default function SmartDownloadButton({
  downloadLinks,
  className = 'btn btn-primary btn-lg hero-download-btn',
}) {
  const platform = useMemo(() => detectDownloadPlatform(), []);
  const href = getDownloadHref(platform, downloadLinks);
  const available = isPlatformDownloadAvailable(platform, downloadLinks) && Boolean(href);
  const label = getPlatformLabel(platform);

  const trackDownload = () => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'download', { platform });
    }
  };

  const content = (
    <>
      <DownloadIcon />
      <span>Download Free</span>
      <PlatformIcon platform={platform} className="platform-os-icon" />
    </>
  );

  if (!available || !href) {
    return (
      <div className="smart-download-wrap">
        <a
          href="#download"
          className={className}
          aria-label="View download options"
        >
          {content}
        </a>
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
