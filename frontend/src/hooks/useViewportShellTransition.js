import { useState, useEffect } from 'react';

/**
 * Swap mobile/desktop app shells when the viewport crosses the mobile breakpoint.
 * Instant swap — crossfade delay left the desktop shell running at phone width
 * (sidebars off-screen, FriendsPage in mobile mode inside desktop chrome).
 */
export function useViewportShellTransition(isMobile) {
  const [shellMobile, setShellMobile] = useState(isMobile);

  useEffect(() => {
    setShellMobile(isMobile);
  }, [isMobile]);

  return { shellMobile, phase: 'visible' };
}
