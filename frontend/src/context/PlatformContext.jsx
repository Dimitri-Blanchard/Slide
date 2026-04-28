import React, { createContext, useContext, useState, useEffect } from 'react';

const PlatformContext = createContext({
  isElectron: false,
  isCapacitor: false,
  isAndroid: false,
  isIOS: false,
  isWeb: true,
  isMobileDevice: false,
  isDesktop: true,
  platform: 'web',
  // 'electron' | 'android' | 'ios' | 'web'
  deviceType: 'web',
});

export function usePlatform() {
  return useContext(PlatformContext);
}

function detectPlatform() {
  if (typeof window === 'undefined') return { isElectron: false, isCapacitor: false, isAndroid: false, isIOS: false, isWeb: true, isMobileDevice: false, isDesktop: true, platform: 'web', deviceType: 'web' };
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
  // isDesktop = Electron or web on a desktop browser (not a phone)
  const isDesktop = isElectron || isWeb;
  // deviceType: single string for easy switches
  const deviceType = isElectron ? 'electron' : isAndroid ? 'android' : isIOS ? 'ios' : 'web';
  return {
    isElectron,
    isCapacitor,
    isAndroid,
    isIOS,
    isWeb,
    isMobileDevice,
    isDesktop,
    platform: plat,
    deviceType,
  };
}

export function PlatformProvider({ children }) {
  const [platform, setPlatform] = useState(detectPlatform);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // Clean all platform classes first
    root.classList.remove('platform-android', 'platform-ios', 'platform-electron', 'platform-web', 'platform-mobile', 'platform-desktop');
    // Add specific platform class
    if (platform.isAndroid) root.classList.add('platform-android', 'platform-mobile');
    else if (platform.isIOS) root.classList.add('platform-ios', 'platform-mobile');
    else if (platform.isElectron) root.classList.add('platform-electron', 'platform-desktop');
    else root.classList.add('platform-web', 'platform-desktop');
  }, [platform]);

  return (
    <PlatformContext.Provider value={platform}>
      {children}
    </PlatformContext.Provider>
  );
}
