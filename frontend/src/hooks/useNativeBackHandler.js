import { useEffect } from 'react';

/**
 * Handles Android hardware back events in Capacitor while remaining a no-op on web.
 * Higher priority handlers should be registered by overlays that sit above others.
 */
export function useNativeBackHandler(enabled, handler, priority = 0) {
  useEffect(() => {
    if (!enabled) return undefined;

    let removeListener;
    let disposed = false;

    import('@capacitor/app')
      .then(({ App }) => App.addListener('backButton', (event) => {
        const canGoBack = event?.canGoBack;
        const handled = handler?.(event);
        if (!handled && canGoBack && typeof window !== 'undefined') {
          window.history.back();
        }
      }))
      .then((listener) => {
        if (disposed) {
          listener?.remove?.();
          return;
        }
        removeListener = listener?.remove?.bind(listener);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [enabled, handler, priority]);
}
