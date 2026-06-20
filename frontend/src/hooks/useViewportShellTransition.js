import { useState, useEffect, useRef } from 'react';

const SHELL_MS = 340;

function getShellDuration() {
  if (typeof window === 'undefined') return SHELL_MS;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SHELL_MS;
}

/** Crossfade between mobile / desktop app shells on viewport resize. */
export function useViewportShellTransition(isMobile) {
  const [shellMobile, setShellMobile] = useState(isMobile);
  const [phase, setPhase] = useState('visible');
  const ready = useRef(false);

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      setShellMobile(isMobile);
      return;
    }
    if (isMobile === shellMobile) return;

    const duration = getShellDuration();
    if (duration === 0) {
      setShellMobile(isMobile);
      setPhase('visible');
      return;
    }

    setPhase('exiting');
    const timer = window.setTimeout(() => {
      setShellMobile(isMobile);
      setPhase('entering');
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setPhase('visible'));
      });
    }, duration);
    return () => window.clearTimeout(timer);
  }, [isMobile, shellMobile]);

  return { shellMobile, phase };
}
