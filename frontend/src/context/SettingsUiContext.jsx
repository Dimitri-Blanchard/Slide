import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePlatform } from './PlatformContext';
import { isSettingsRoute } from '../layouts/appPaths';
import { shouldUseSettingsModal } from '../utils/clientApp';

const SettingsUiContext = createContext(null);

export function SettingsUiProvider({ children }) {
  const platform = usePlatform();
  const { viewportWidth } = platform;
  const settingsUseModal = shouldUseSettingsModal(platform, viewportWidth);
  const navigate = useNavigate();
  const location = useLocation();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [desktopInitialSection, setDesktopInitialSection] = useState(null);
  const [desktopQuery, setDesktopQuery] = useState('');
  const handledRouteRef = useRef(null);

  const openSettings = useCallback(({ section } = {}) => {
    if (!settingsUseModal) {
      navigate(section ? `/settings?section=${encodeURIComponent(section)}` : '/settings');
      return;
    }
    setDesktopInitialSection(section || null);
    setDesktopQuery('');
    setDesktopOpen(true);
  }, [settingsUseModal, navigate]);

  const closeSettings = useCallback(() => {
    setDesktopOpen(false);
    setDesktopInitialSection(null);
    setDesktopQuery('');
  }, []);

  useLayoutEffect(() => {
    if (!settingsUseModal) return;
    if (!isSettingsRoute(location.pathname)) {
      handledRouteRef.current = null;
      return;
    }

    const routeKey = `${location.pathname}${location.search}`;
    if (handledRouteRef.current === routeKey) return;
    handledRouteRef.current = routeKey;

    const params = new URLSearchParams(location.search);
    setDesktopInitialSection(params.get('section'));
    setDesktopQuery(location.search.replace(/^\?/, ''));
    setDesktopOpen(true);

    const returnTo = location.state?.settingsReturnTo
      || (location.pathname !== '/settings' ? `${location.pathname}${location.search}` : null)
      || '/channels/@me';
    navigate(returnTo, { replace: true });
  }, [settingsUseModal, location.pathname, location.search, location.state, navigate]);

  const value = useMemo(() => ({
    openSettings,
    closeSettings,
    settingsUseModal,
    desktopSettingsOpen: desktopOpen,
    desktopInitialSection,
    desktopQuery,
    isMobileSettingsRoute: !settingsUseModal && isSettingsRoute(location.pathname),
  }), [
    openSettings,
    closeSettings,
    settingsUseModal,
    desktopOpen,
    desktopInitialSection,
    desktopQuery,
    location.pathname,
  ]);

  return (
    <SettingsUiContext.Provider value={value}>
      {children}
    </SettingsUiContext.Provider>
  );
}

export function useSettingsUi() {
  const ctx = useContext(SettingsUiContext);
  if (!ctx) {
    throw new Error('useSettingsUi must be used within SettingsUiProvider');
  }
  return ctx;
}
