import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { restoreToken } from './utils/tokenStorage';
import { applyCapacitorBootRedirect, applyElectronBootRedirect } from './utils/clientApp';
import { SocketProvider } from './context/SocketContext';
import { NotificationProvider } from './context/NotificationContext';
import { SettingsProvider } from './context/SettingsContext';
import { LanguageProvider } from './context/LanguageContext';
import { PlatformProvider } from './context/PlatformContext';
import { SettingsUiProvider } from './context/SettingsUiContext';
import { VoiceProvider } from './context/VoiceContext';
import { SoundProvider } from './context/SoundContext';
import { OfflineProvider } from './context/OfflineContext';
import { OrbsProvider } from './context/OrbsContext';
import { PrefetchProvider } from './context/PrefetchContext';
import { SceneProvider } from './context/SceneContext';
import { UndoToastContainer } from './components/UndoToast';
import Notifications from './components/Notifications';
import QrLoginBridge from './components/QrLoginBridge';
import IncomingCallModal from './components/IncomingCallModal';
import ScreenSharePicker from './components/ScreenSharePicker';
import MicrophoneAccessNotice from './components/MicrophoneAccessNotice';
import ErrorBoundary from './components/ErrorBoundary';
import { resolvePagesBasename } from './utils/pagesBasename';
import { serverPath, serverChannelPath } from './utils/appRoutes';
import { startDevToolsWarning } from './utils/security';
import './index.css';
import './styles/voice-leave.css';

// ─────────────────────────────────────────────────────────────
// VIEWPORT METRICS — runs before React renders.
// Sets reliable CSS custom properties instead of relying on
// env(safe-area-inset-*) which is often 0 in Android WebView
// even when edge-to-edge is enabled.
// ─────────────────────────────────────────────────────────────
let viewportRaf = 0;
function updateViewportMetrics() {
  // Visible height — keyboard + edge-to-edge (visualViewport when available)
  let h = window.innerHeight;
  if (window.visualViewport?.height) {
    h = window.visualViewport.height;
  }
  document.documentElement.style.setProperty('--app-height', `${Math.max(1, Math.round(h))}px`);

  // Probe env() values by measuring a test element.
  // Returns 0 if env() is unsupported/not dispatched yet.
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:1px;opacity:0;pointer-events:none;z-index:-1;';
  document.documentElement.appendChild(probe);

  probe.style.height = 'env(safe-area-inset-top, 0px)';
  const insetTop = probe.getBoundingClientRect().height;

  probe.style.height = 'env(safe-area-inset-bottom, 0px)';
  const insetBottom = probe.getBoundingClientRect().height;

  document.documentElement.removeChild(probe);

  document.documentElement.style.setProperty('--inset-top', `${insetTop}px`);
  document.documentElement.style.setProperty('--inset-bottom', `${insetBottom}px`);
}

function scheduleViewportMetrics() {
  if (viewportRaf) cancelAnimationFrame(viewportRaf);
  viewportRaf = requestAnimationFrame(() => {
    viewportRaf = 0;
    updateViewportMetrics();
  });
}

// Anti-self-XSS: warn when dev tools/console is open
if (typeof window !== 'undefined') {
  startDevToolsWarning();
}

// Electron: capture browser-auth deep links as soon as the renderer boots.
// AuthProvider may still be mounting or may have timed out its initial handoff.
if (typeof window !== 'undefined' && window.electron?.onProtocolUrl) {
  window.electron.onProtocolUrl((url) => {
    import('./utils/qrLoginFlow')
      .then(({ queueBrowserAuthUrl }) => queueBrowserAuthUrl(url))
      .catch(() => {});
  });
}

// Run now, then again after a short delay in case the
// Android WebView dispatches insets after first paint.
if (typeof window !== 'undefined') {
  updateViewportMetrics();
  setTimeout(updateViewportMetrics, 100);
  setTimeout(updateViewportMetrics, 400);
  setTimeout(updateViewportMetrics, 800);
  window.addEventListener('resize', scheduleViewportMetrics);
  window.addEventListener('orientationchange', () => setTimeout(updateViewportMetrics, 50));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleViewportMetrics);
    window.visualViewport.addEventListener('scroll', scheduleViewportMetrics);
  }
}

// Capacitor: initialize native plugins
if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#1a1a2e' }).catch(() => {});
  });
  import('@capacitor/keyboard').then(({ Keyboard }) => {
    Keyboard.setResizeMode?.({ mode: 'body' }).catch(() => {});
    // Force a synchronous viewport metric pass on keyboard show/hide instead
    // of waiting for the visualViewport rAF. Combined with the `kb-hiding`
    // class (mobile-animations.css disables transitions while it's set),
    // this collapses the lag between keyboard slide-down and the message
    // list snapping back into position.
    const root = document.documentElement;
    Keyboard.addListener?.('keyboardWillHide', () => {
      root.classList.add('kb-hiding');
      updateViewportMetrics();
    }).catch(() => {});
    Keyboard.addListener?.('keyboardDidHide', () => {
      updateViewportMetrics();
      // Drop the freeze on the next frame so post-keyboard interactions can animate again
      requestAnimationFrame(() => root.classList.remove('kb-hiding'));
    }).catch(() => {});
    Keyboard.addListener?.('keyboardWillShow', () => {
      updateViewportMetrics();
    }).catch(() => {});
    Keyboard.addListener?.('keyboardDidShow', () => {
      updateViewportMetrics();
    }).catch(() => {});
  });
  import('@capacitor/app').then(({ App: CapApp }) => {
    const hashPath = () => {
      const raw = (window.location.hash.slice(1).split('?')[0] || '/').replace(/\/+$/, '') || '/';
      return raw;
    };

    CapApp.addListener('backButton', () => {
      const path = hashPath();

      if (path === '/' || path === '') {
        import('./utils/tokenStorage').then(({ getToken }) => {
          window.location.replace(getToken() ? '#/channels/@me' : '#/login');
        });
        return;
      }

      const exitRoutes = ['/login', '/register', '/forgot-password'];
      if (exitRoutes.includes(path)) {
        CapApp.exitApp?.().catch(() => {});
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      import('./utils/tokenStorage').then(({ getToken }) => {
        window.location.replace(getToken() ? '#/channels/@me' : '#/login');
      });
    });
    // Handle slide://login?token=xxx (and https /qr-login links) for QR web login approval
    const handleLoginUrl = async (url) => {
      if (!url || typeof url !== 'string') return;
      const flow = await import('./utils/qrLoginFlow');
      const { extractQrTokenFromUrl, isQrLoginDeepLink, navigateToQrLoginConfirm } = flow;
      if (!isQrLoginDeepLink(url)) return;
      const token = extractQrTokenFromUrl(url);
      if (!token) return;
      // Show animated confirm screen in-app instead of silent approve
      navigateToQrLoginConfirm(token);
    };
    CapApp.addListener('appUrlOpen', ({ url }) => handleLoginUrl(url));
    CapApp.getLaunchUrl().then(({ url }) => handleLoginUrl(url)).catch(() => {});
  });
  import('@capacitor/push-notifications').then(({ PushNotifications }) => {
    const getStringValue = (data, keys) => {
      for (const key of keys) {
        const value = data?.[key];
        if (value != null && value !== '') return String(value);
      }
      return '';
    };

    const hashFromPath = (path) => {
      if (!path || typeof path !== 'string') return '';
      if (path.startsWith('#/')) return path;
      if (path.startsWith('/')) return `#${path}`;
      try {
        const url = new URL(path);
        if (url.hash?.startsWith('#/')) return url.hash;
        return `#${url.pathname}${url.search || ''}`;
      } catch {
        return '';
      }
    };

    const routeFromNotificationData = (rawData = {}) => {
      const data = rawData && typeof rawData === 'object' ? rawData : {};
      const explicitRoute = hashFromPath(getStringValue(data, ['url', 'route', 'path', 'link']));
      if (explicitRoute) return explicitRoute;

      const conversationId = getStringValue(data, ['conversationId', 'conversation_id', 'dmId', 'dm_id']);
      if (conversationId) return `#/channels/@me/${encodeURIComponent(conversationId)}`;

      const teamId = getStringValue(data, ['teamId', 'team_id', 'serverId', 'server_id']);
      const channelId = getStringValue(data, ['channelId', 'channel_id']);
      if (teamId && channelId) {
        return `#${serverChannelPath(teamId, channelId)}`;
      }
      if (teamId) return `#${serverPath(teamId)}`;

      return '#/channels/@me';
    };

    PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
      const notification = event?.notification || {};
      const data = notification.data || notification.extra || {};
      const targetHash = routeFromNotificationData(data);
      if (!targetHash) return;

      if (window.location.hash === targetHash) {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        return;
      }
      window.location.hash = targetHash;
    }).catch((err) => {
      console.warn('[Push] Notification action listener failed:', err?.message || err);
    });
  }).catch((err) => {
    console.warn('[Push] Native notification tap setup failed:', err?.message || err);
  });
}

// Capacitor and Electron require HashRouter — BrowserRouter causes black screen
// in production (file/local server) and silent navigation failures.
// Web only uses BrowserRouter.
const isNativePlatform = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
const isElectron = typeof window !== 'undefined' && window.electron?.isElectron;
const Router = ({ children }) =>
  isNativePlatform || isElectron ? (
    <HashRouter>{children}</HashRouter>
  ) : (
    <BrowserRouter basename={resolvePagesBasename()}>{children}</BrowserRouter>
  );

const AppWithProviders = () => (
  <LanguageProvider>
    <SceneProvider>
    <SettingsProvider>
      <Router>
        <PlatformProvider>
          <SettingsUiProvider>
          <NotificationProvider>
            <Notifications />
            <QrLoginBridge />
            <AuthProvider>
              <SoundProvider>
                <SocketProvider>
                  <OfflineProvider>
                    <PrefetchProvider>
                    <OrbsProvider>
                      <VoiceProvider>
                        <IncomingCallModal />
                        <ScreenSharePicker />
                        <MicrophoneAccessNotice />
                        <App />
                        <UndoToastContainer />
                      </VoiceProvider>
                    </OrbsProvider>
                    </PrefetchProvider>
                  </OfflineProvider>
                </SocketProvider>
              </SoundProvider>
            </AuthProvider>
          </NotificationProvider>
          </SettingsUiProvider>
        </PlatformProvider>
      </Router>
    </SettingsProvider>
    </SceneProvider>
  </LanguageProvider>
);

// Restore token from native storage (Capacitor) before first render so auth works on relaunch
function mountApp() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <AppWithProviders />
    </ErrorBoundary>
  );
}

const RESTORE_TOKEN_STARTUP_MS = 4000;

function restoreTokenWithStartupTimeout() {
  return Promise.race([
    restoreToken(),
    new Promise((resolve) => {
      setTimeout(() => {
        console.warn('[Auth] restoreToken startup timeout — mounting app anyway');
        resolve(null);
      }, RESTORE_TOKEN_STARTUP_MS);
    }),
  ]);
}

restoreTokenWithStartupTimeout()
  .catch((err) => {
    console.warn('[Auth] restoreToken failed on startup — continuing without restored token', err);
  })
  .then(() => {
    applyCapacitorBootRedirect();
    applyElectronBootRedirect();
  })
  .finally(mountApp);
