import { useEffect, useState } from 'react';
import { DOWNLOAD_BASE, getLatestDownloadArtifacts } from '../api';

const FALLBACK_LINKS = {
  windows: `${DOWNLOAD_BASE}/download/Slide_Alpha_v0.0.4.exe`,
  android: `${DOWNLOAD_BASE}/download/Slide_Alpha_v0.0.4.apk`,
  linux: `${DOWNLOAD_BASE}/download/Slide_Alpha_v0.0.1.AppImage`,
};

export default function useDownloadLinks() {
  const [downloadLinks, setDownloadLinks] = useState(FALLBACK_LINKS);

  useEffect(() => {
    let cancelled = false;

    getLatestDownloadArtifacts()
      .then((data) => {
        if (cancelled || !data) return;

        const resolveUrl = (entry, fallback) => {
          if (!entry?.url) return fallback;
          if (entry.url.startsWith('http://') || entry.url.startsWith('https://')) return entry.url;
          return `${DOWNLOAD_BASE}${entry.url}`;
        };

        setDownloadLinks((prev) => ({
          windows: resolveUrl(data.windows, prev.windows),
          android: resolveUrl(data.android, prev.android),
          linux: resolveUrl(data.linux, prev.linux),
        }));
      })
      .catch(() => {
        // Keep static fallbacks when the endpoint is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return downloadLinks;
}
