import React, { createContext, useContext, useState, useEffect } from 'react';

const PlatformContext = createContext({
  isElectron: false,
  isCapacitor: false,
  isAndroid: false,
  isIOS: false,
  platform: 'web',
});

export function usePlatform() {
  return useContext(PlatformContext);
}

function detectPlatform() {
  if (typeof window === 'undefined') return { isElectron: false, isCapacitor: false, isAndroid: false, isIOS: false, platform: 'web' };
  const cap = window.Capacitor;
  const electron = window.electron;
  const isCapacitor = !!(cap?.isNativePlatform?.());
  const plat = cap?.getPlatform?.() || 'web';
  return {
    isElectron: !!electron?.isElectron,
    isCapacitor,
    isAndroid: plat === 'android',
    isIOS: plat === 'ios',
    platform: plat,
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
    if (platform.isAndroid) {
      root.classList.add('platform-android');
      root.classList.remove('platform-ios', 'platform-electron');
    } else if (platform.isIOS) {
      root.classList.add('platform-ios');
      root.classList.remove('platform-android', 'platform-electron');
    } else if (platform.isElectron) {
      root.classList.add('platform-electron');
      root.classList.remove('platform-android', 'platform-ios');
    } else {
      root.classList.remove('platform-android', 'platform-ios', 'platform-electron');
    }
  }, [platform]);

  return (
    <PlatformContext.Provider value={platform}>
      {children}
    </PlatformContext.Provider>
  );
}
