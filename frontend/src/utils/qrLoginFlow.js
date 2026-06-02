/**
 * QR login flow: web displays QR → phone scans → mobile app approves session.
 */
import { auth } from '../api';
import { getToken, getOrCreateDeviceId, getDeviceName } from './tokenStorage';

const PENDING_QR_TOKEN_KEY = 'slide_pending_qr_login_token';
const PUBLIC_SITE = (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://sl1de.xyz').replace(/\/$/, '');

/** Deep link / intent URL to open the native app for QR approval (mobile browser). */
/** Normalize /auth/qr-login/check response (field names vary by backend version). */
export function normalizeQrLoginCheckResponse(data) {
  if (!data || typeof data !== 'object') {
    return { status: null, user: null, token: null };
  }
  const status = data.status ?? data.state ?? null;
  const session = data.session && typeof data.session === 'object' ? data.session : null;
  const user = data.user ?? session?.user ?? data.account ?? null;
  const token =
    data.token ??
    data.accessToken ??
    data.access_token ??
    data.jwt ??
    session?.token ??
    session?.accessToken ??
    session?.access_token ??
    null;
  return { status, user, token };
}

export function buildOpenSlideAppUrl(token, fallbackPageUrl) {
  if (!token) return null;
  const slideUrl = `slide://login?token=${encodeURIComponent(token)}`;
  const fallback =
    fallbackPageUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/qr-login?token=${encodeURIComponent(token)}`
      : `${PUBLIC_SITE}/qr-login?token=${encodeURIComponent(token)}`);

  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  if (!isAndroid) return slideUrl;

  // Do not set package= — debug builds use com.slide.messenger.debug and a missing
  // package makes Chrome open the Play Store for sideloaded apps not on Google Play.
  const encodedFallback = encodeURIComponent(fallback);
  return (
    `intent://login?token=${encodeURIComponent(token)}` +
    '#Intent;scheme=slide;action=android.intent.action.VIEW;' +
    'category=android.intent.category.BROWSABLE;' +
    `S.browser_fallback_url=${encodedFallback};end`
  );
}

/** Try to open the installed Slide app; stays on fallbackPageUrl if unavailable. */
export function openSlideApp(token, fallbackPageUrl) {
  const url = buildOpenSlideAppUrl(token, fallbackPageUrl);
  if (!url || typeof window === 'undefined') return;
  window.location.href = url;
}

export function buildQrLoginScanUrl(token) {
  if (!token) return '';
  const encoded = encodeURIComponent(token);
  if (typeof window !== 'undefined') {
    const origin = window.location.origin || '';
    const isLocal =
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
    // Local dev: deep link opens the installed app directly (same API as production).
    if (isLocal) {
      return `slide://login?token=${encoded}`;
    }
    const isHttp = origin.startsWith('http://') || origin.startsWith('https://');
    if (isHttp) {
      return `${PUBLIC_SITE}/qr-login?token=${encoded}`;
    }
  }
  return `${PUBLIC_SITE}/qr-login?token=${encoded}`;
}

export function extractQrTokenFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const normalized = url.replace(/^slide:\/\/\/?login/i, 'https://slide.local/login');
    const parsed = new URL(normalized, 'https://slide.local');
    const fromQuery = parsed.searchParams.get('token');
    if (fromQuery) return fromQuery;
  } catch {
    // fall through to regex
  }
  const match = url.match(/[?&]token=([^&#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export function isQrLoginDeepLink(url) {
  if (!url || typeof url !== 'string') return false;
  if (/^slide:\/\/\/?login/i.test(url)) return true;
  if (/\/qr-login/i.test(url) && extractQrTokenFromUrl(url)) return true;
  return false;
}

export function savePendingQrLoginToken(token) {
  if (!token || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PENDING_QR_TOKEN_KEY, token);
}

export function clearPendingQrLoginToken() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PENDING_QR_TOKEN_KEY);
}

export function getPendingQrLoginToken() {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(PENDING_QR_TOKEN_KEY);
}

/** Open the in-app QR confirmation screen (HashRouter on native). */
export function navigateToQrLoginConfirm(token) {
  if (!token || typeof window === 'undefined') return;
  const hash = `#/qr-login?token=${encodeURIComponent(token)}`;
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

export function emitQrLoginConfirming() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('slide:qr-login-confirming'));
}

export function emitQrLoginResult(success, message) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('slide:qr-login-result', {
      detail: { success: !!success, message: message || '' },
    }),
  );
}

function triggerMobileSuccessFeedback() {
  import('./nativeHaptics')
    .then(({ hapticNotification }) => hapticNotification('Success'))
    .catch(() => {});
}

/** Preload account data after QR success (native app). */
export async function prefetchSlideAppData(onStep) {
  const { auth, teams } = await import('../api');
  onStep?.('Connexion au compte…');
  await auth.me().catch(() => {});
  onStep?.('Chargement des serveurs…');
  await teams.list().catch(() => {});
  onStep?.('Finalisation…');
  await new Promise((r) => setTimeout(r, 400));
}

export async function approveQrLoginSession(token) {
  if (!token) throw new Error('Token manquant');
  if (!getToken()) {
    savePendingQrLoginToken(token);
    const err = new Error('NOT_LOGGED_IN');
    throw err;
  }
  emitQrLoginConfirming();
  const deviceName = await getDeviceName();
  await auth.qrLogin.approve(token, getOrCreateDeviceId(), deviceName);
  clearPendingQrLoginToken();
  triggerMobileSuccessFeedback();
  emitQrLoginResult(true, 'Connexion confirmée ! Vous pouvez revenir à votre ordinateur.');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('qr-login-approved', {
        detail: { message: 'Connexion confirmée sur votre ordinateur.' },
      }),
    );
  }
}

export async function processPendingQrLoginIfAny() {
  const token = getPendingQrLoginToken();
  if (!token || !getToken()) return false;
  try {
    await approveQrLoginSession(token);
    return true;
  } catch (err) {
    if (err?.message === 'NOT_LOGGED_IN') return false;
    clearPendingQrLoginToken();
    return false;
  }
}
