import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getToken } from '../utils/tokenStorage';
import {
  isClientApp,
  isLandingPath,
  resolveClientHomePath,
} from '../utils/clientApp';

/**
 * Runtime safety net: if anything navigates to `/`, bounce to app home immediately.
 */
export default function NativeRouteGuard() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!isClientApp() || !isLandingPath(pathname)) return;
    if (loading && !!getToken() && !user) return;

    const target = resolveClientHomePath({ user, hasToken: !!getToken() });
    if (pathname !== target) {
      navigate(target, { replace: true });
    }
  }, [pathname, user, loading, navigate]);

  return null;
}
