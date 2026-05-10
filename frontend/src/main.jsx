import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { restoreToken } from './utils/tokenStorage';
import { SocketProvider } from './context/SocketContext';
import { NotificationProvider } from './context/NotificationContext';
import { SettingsProvider } from './context/SettingsContext';
import { LanguageProvider } from './context/LanguageContext';
import { PlatformProvider } from './context/PlatformContext';
import { VoiceProvider } from './context/VoiceContext';
import { SoundProvider } from './context/SoundContext';
import { OfflineProvider } from './context/OfflineContext';
import { OrbsProvider } from './context/OrbsContext';
import { PrefetchProvider } from './context/PrefetchContext';
import { SceneProvider } from './context/SceneContext';
import { UndoToastContainer } from './components/UndoToast';
import Notifications from './components/Notifications';
import IncomingCallModal from './components/IncomingCallModal';
import ScreenSharePicker from './components/ScreenSharePicker';
import ErrorBoundary from './components/ErrorBoundary';
import { startDevToolsWarning } from './utils/security';
import './index.css';

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
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      }
    });
    // Handle slide://login?token=xxx for QR login (scan with mobile to approve web login)
    const handleLoginUrl = async (url) => {
      if (!url || typeof url !== 'string') return;
      try {
        if (!url.startsWith('slide://login') && !url.startsWith('slide:///login')) return;
        const tokenMatch = url.match(/[?&]token=([^&]+)/);
        const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
        if (token) {
            const { auth } = await import('./api');
            const { getToken, getOrCreateDeviceId, getDeviceName } = await import('./utils/tokenStorage');
            const authToken = getToken();
            if (!authToken) {
              console.warn('QR login: Not logged in on mobile. Please log in first.');
              return;
            }
            const deviceName = await getDeviceName();
            await auth.qrLogin.approve(token, getOrCreateDeviceId(), deviceName);
            window.dispatchEvent(new CustomEvent('qr-login-approved'));
          }
      } catch (err) {
        console.warn('QR login deep link error:', err);
      }
    };
    CapApp.addListener('appUrlOpen', ({ url }) => handleLoginUrl(url));
    CapApp.getLaunchUrl().then(({ url }) => handleLoginUrl(url)).catch(() => {});
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
    <BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>
  );

const AppWithProviders = () => (
  <LanguageProvider>
    <SceneProvider>
    <SettingsProvider>
      <Router>
        <PlatformProvider>
          <NotificationProvider>
            <Notifications />
            <AuthProvider>
              <SoundProvider>
                <SocketProvider>
                  <OfflineProvider>
                    <PrefetchProvider>
                    <OrbsProvider>
                      <VoiceProvider>
                        <IncomingCallModal />
                        <ScreenSharePicker />
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
        </PlatformProvider>
      </Router>
    </SettingsProvider>
    </SceneProvider>
  </LanguageProvider>
);

// Restore token from native storage (Capacitor) before first render so auth works on relaunch
restoreToken().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <AppWithProviders />
    </ErrorBoundary>
  );
});
