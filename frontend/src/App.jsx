import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { getToken } from './utils/tokenStorage';
import AppLayout from './layouts/AppLayout';
import ElectronTitleBar from './components/ElectronTitleBar';
import DevelopmentBanner from './components/DevelopmentBanner';
import CookieBanner from './components/CookieBanner';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const InvitePage = lazy(() => import('./pages/InvitePage'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const QrLoginRedirect = lazy(() => import('./pages/QrLoginRedirect'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

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
  if (!loading && !user) return <Navigate to="/login" replace />;
  if (loading && !hasToken) return <RouteLoadingFallback />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  const hasToken = !!getToken();
  if (!loading && user) return <Navigate to="/channels/@me" replace />;
  if (loading && hasToken) return <RouteLoadingFallback />;
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
  const isElectron = typeof window !== 'undefined' && !!window.electron?.isElectron;
  const isCapacitor = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
  const isNativeApp = isElectron || isCapacitor;
  const rootRedirect = getToken() ? '/channels/@me' : '/login';
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
      <div className={`app-root ${isElectron ? 'has-electron-title-bar' : ''}`}>
        {isElectron && <ElectronTitleBar />}
        <SplashScreen onDone={dismissSplash} quick={isCapacitor} />
      </div>
    );
  }

  return (
    <div className={`app-root ${isElectron ? 'has-electron-title-bar' : ''}`}>
      <ElectronTitleBar />
      {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_BANNER === 'true') && (
        <DevelopmentBanner />
      )}
      <div className="app-content">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route
              path="/"
              element={
                isNativeApp
                  ? <Navigate to={rootRedirect} replace />
                  : <PublicRoute><LandingPage /></PublicRoute>
              }
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
      <CookieBanner />
    </div>
  );
}
