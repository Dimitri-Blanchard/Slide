import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/** Must match AppLayout useIsMobile — web mobile shell only at <=768px. */
const MOBILE_SHELL_BREAKPOINT = 768;

const PlatformContext = createContext({
  isElectron: false,
  isCapacitor: false,
  isAndroid: false,
  isIOS: false,
  isWeb: true,
  isMobileDevice: false,
  isMobileShellViewport: false,
  isDesktop: true,
  platform: 'web',
  // 'electron' | 'android' | 'ios' | 'web'
  deviceType: 'web',
});

export function usePlatform() {
  return useContext(PlatformContext);
}

function detectPlatform() {
  if (typeof window === 'undefined') {
    return {
      isElectron: false,
      isCapacitor: false,
      isAndroid: false,
      isIOS: false,
      isWeb: true,
      isMobileDevice: false,
      platform: 'web',
      deviceType: 'web',
    };
  }
  const cap = window.Capacitor;
  const electron = window.electron;
  const isCapacitor = !!(cap?.isNativePlatform?.());
  const plat = cap?.getPlatform?.() || 'web';
  const isElectron = !!electron?.isElectron;
  const isAndroid = plat === 'android';
  const isIOS = plat === 'ios';
  // isMobileDevice = actual mobile device (Capacitor Android/iOS), NOT small browser window
  const isMobileDevice = isAndroid || isIOS;
  // isWeb = running in a regular browser (not Electron, not Capacitor)
  const isWeb = !isElectron && !isCapacitor;
  // deviceType: single string for easy switches
  const deviceType = isElectron ? 'electron' : isAndroid ? 'android' : isIOS ? 'ios' : 'web';
  return {
    isElectron,
    isCapacitor,
    isAndroid,
    isIOS,
    isWeb,
    isMobileDevice,
    platform: plat,
    deviceType,
  };
}

/** Same rules as AppLayout useIsMobile — mobile shell + platform-mobile CSS must stay in sync. */
export function isMobileShellViewport(platform, width = typeof window !== 'undefined' ? window.innerWidth : MOBILE_SHELL_BREAKPOINT + 1) {
  if (!platform) return false;
  if (platform.isMobileDevice) return true;
  return width <= MOBILE_SHELL_BREAKPOINT;
}

export function PlatformProvider({ children }) {
  const [platform, setPlatform] = useState(detectPlatform);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : MOBILE_SHELL_BREAKPOINT + 1
  );

  const syncViewportWidth = useCallback(() => {
    if (typeof window === 'undefined') return;
    setViewportWidth(window.innerWidth);
  }, []);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    syncViewportWidth();
    const mqMobile = window.matchMedia(`(max-width: ${MOBILE_SHELL_BREAKPOINT}px)`);
    mqMobile.addEventListener('change', syncViewportWidth);
    window.addEventListener('resize', syncViewportWidth);
    return () => {
      mqMobile.removeEventListener('change', syncViewportWidth);
      window.removeEventListener('resize', syncViewportWidth);
    };
  }, [syncViewportWidth]);

  const mobileShell = isMobileShellViewport(platform, viewportWidth);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // Clean all platform classes first
    root.classList.remove(
      'platform-android',
      'platform-ios',
      'platform-electron',
      'platform-web',
      'platform-mobile',
      'platform-desktop',
      'client-app'
    );
    // Add specific platform class
    if (platform.isAndroid) root.classList.add('platform-android', 'platform-mobile', 'client-app');
    else if (platform.isIOS) root.classList.add('platform-ios', 'platform-mobile', 'client-app');
    else if (platform.isElectron) {
      root.classList.add('platform-electron', 'client-app');
      root.classList.add(mobileShell ? 'platform-mobile' : 'platform-desktop');
    } else {
      root.classList.add('platform-web');
      root.classList.add(mobileShell ? 'platform-mobile' : 'platform-desktop');
    }
  }, [platform, mobileShell]);

  const contextValue = {
    ...platform,
    viewportWidth,
    isMobileShellViewport: mobileShell,
    isDesktop: platform.isElectron || (platform.isWeb && !mobileShell),
  };

  return (
    <PlatformContext.Provider value={contextValue}>
      {children}
    </PlatformContext.Provider>
  );
}
