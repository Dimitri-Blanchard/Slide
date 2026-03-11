import { useState, useEffect } from 'react';

/**
 * Détecte si l'utilisateur est en ligne (connecté à Internet).
 * Utilise navigator.onLine + des pings périodiques pour plus de fiabilité.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
