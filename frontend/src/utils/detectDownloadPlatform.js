/** @typedef {'windows' | 'android' | 'linux'} DownloadPlatform */

/**
 * Detect the user's OS for the smart download CTA (Windows, Android, or Linux).
 * @returns {DownloadPlatform}
 */
export function detectDownloadPlatform() {
  if (typeof navigator === 'undefined') return 'windows';

  const ua = navigator.userAgent.toLowerCase();
  const platform = String(
    navigator.userAgentData?.platform ?? navigator.platform ?? '',
  ).toLowerCase();

  if (/android/.test(ua)) return 'android';
  if (/win/.test(ua) || platform.includes('win')) return 'windows';
  if (
    /linux|x11/.test(ua) ||
    /cros/.test(ua) ||
    platform.includes('linux') ||
    platform === 'chrome os'
  ) {
    return 'linux';
  }

  return 'windows';
}

/** @param {DownloadPlatform} platform */
export function getPlatformLabel(platform) {
  switch (platform) {
    case 'android':
      return 'Android';
    case 'linux':
      return 'Linux';
    case 'windows':
    default:
      return 'Windows';
  }
}

/**
 * @param {DownloadPlatform} platform
 * @param {{ windows?: string, android?: string, linux?: string } | null | undefined} downloadLinks
 */
export function isPlatformDownloadAvailable(platform, downloadLinks) {
  const href = downloadLinks?.[platform];
  if (href) return true;
  return platform === 'windows' || platform === 'android';
}
