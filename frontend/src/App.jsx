import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { getToken } from './utils/tokenStorage';
import AppLayout from './layouts/AppLayout';
import ElectronTitleBar from './components/ElectronTitleBar';
import DevelopmentBanner from './components/DevelopmentBanner';
import ClientAppRootRedirect from './components/ClientAppRootRedirect';
import NativeRouteGuard from './components/NativeRouteGuard';
import { lazyRoute } from './utils/lazyRoute';
import { isClientApp, shouldShowAppTitleBar } from './utils/clientApp';

/** Compile-time: Capacitor/Electron bundles exclude the marketing site. */
const isNativeBundle =
  import.meta.env.VITE_CAPACITOR === '1' ||
  import.meta.env.VITE_ELECTRON === '1';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const InvitePage = lazy(() => import('./pages/InvitePage'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const PrivacyPolicy = lazyRoute(() => import('./pages/PrivacyPolicy.jsx'));
const TermsOfService = lazyRoute(() => import('./pages/TermsOfService.jsx'));
const QrLoginRedirect = lazy(() => import('./pages/QrLoginRedirect'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const LandingPage = isNativeBundle
  ? null
  : lazy(() => import('./pages/LandingPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RootRoute() {
  if (isClientApp()) {
    return <ClientAppRootRedirect />;
  }
  if (LandingPage == null) {
    return <ClientAppRootRedirect />;
  }
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <LandingPage />
    </Suspense>
  );
}

function RouteLoadingFallback() {
  return (
    <div className="slide-loading-screen" role="status" aria-live="polite" aria-label="Loading">
      <div className="slide-spinner" aria-hidden />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const hasToken = !!getToken();
  const location = useLocation();
  if (!loading && !user) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  if (loading && !hasToken) return <RouteLoadingFallback />;
  return children;
}

function ProtectedAppLayout() {
  return (
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  );
}

function SplashScreen({ onDone, quick }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeAt = quick ? 400 : 800;
    const doneAt = quick ? 700 : 1200;
    const t1 = setTimeout(() => setFadeOut(true), fadeAt);
    const t2 = setTimeout(onDone, doneAt);
    const safety = setTimeout(onDone, quick ? 2000 : 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(safety); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);

  return (
    <div className={`splash-screen ${fadeOut ? 'splash-fade-out' : ''}`}>
      <img src="/logo.png" alt="Slide" className="splash-logo" />
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const isElectron = typeof window !== 'undefined' && !!window.electron?.isElectron;
  const isCapacitor = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
  const showTitleBar = shouldShowAppTitleBar(location.pathname);
  const [showSplash, setShowSplash] = useState(isElectron || isCapacitor);
  const dismissSplash = useCallback(() => {
    setShowSplash(false);
    if (isCapacitor) {
      import('@capacitor/splash-screen')
        .then(({ SplashScreen }) => SplashScreen.hide().catch(() => {}))
        .catch(() => {});
    }
  }, [isCapacitor]);

  if (showSplash) {
    return (
      <div className={`app-root ${showTitleBar ? 'has-electron-title-bar' : ''}`}>
        {showTitleBar && <ElectronTitleBar />}
        <SplashScreen onDone={dismissSplash} quick={isCapacitor} />
      </div>
    );
  }

  return (
    <div className={`app-root ${showTitleBar ? 'has-electron-title-bar' : ''}`}>
      {showTitleBar && <ElectronTitleBar />}
      {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_BANNER === 'true') && (
        <DevelopmentBanner />
      )}
      <div className="app-content">
        <NativeRouteGuard />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route
              path="/app"
              element={(
                <ProtectedRoute>
                  <Navigate to="/channels/@me" replace />
                </ProtectedRoute>
              )}
            />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/invite/:code" element={<InvitePage />} />
            <Route path="/qr-login" element={<QrLoginRedirect />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            <Route path="/channels" element={<Navigate to="/channels/@me" replace />} />
            <Route path="/*" element={<ProtectedAppLayout />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
