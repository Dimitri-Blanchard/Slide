import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getToken } from '../utils/tokenStorage';
import { getClientHomePath } from '../utils/clientApp';

function RouteLoadingFallback() {
  return (
    <div className="slide-loading-screen" role="status" aria-live="polite" aria-label="Loading">
      <div className="slide-spinner" aria-hidden />
    </div>
  );
}

/** Replaces marketing `/` in Capacitor / Electron — login or messages only. */
export default function ClientAppRootRedirect() {
  const { user, loading } = useAuth();
  const hasToken = !!getToken();

  if (loading && hasToken && !user) {
    return <RouteLoadingFallback />;
  }

  return <Navigate to={getClientHomePath({ user, hasToken })} replace />;
}
