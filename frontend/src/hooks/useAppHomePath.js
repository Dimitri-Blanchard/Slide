import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getToken } from '../utils/tokenStorage';
import { getClientHomePath, isClientApp } from '../utils/clientApp';

/** Web marketing home `/`; native app uses login or messages. */
export function useAppHomePath() {
  const { user } = useAuth();
  const hasToken = !!getToken();
  return useMemo(() => {
    if (isClientApp()) return getClientHomePath({ user, hasToken });
    return '/';
  }, [user, hasToken]);
}
