import React, { useState, useEffect, memo } from 'react';
import './AnimatedPanel.css';

const PANEL_MS = 340;

function usePanelPresence(open) {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState(open ? 'open' : 'closed');

  useEffect(() => {
    if (open) {
      setMounted(true);
      setState('entering');
      let raf2;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setState('open'));
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }

    setState('closed');
    const timer = window.setTimeout(() => setMounted(false), PANEL_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { mounted, state };
}

export const AnimatedSidePanel = memo(function AnimatedSidePanel({
  open,
  variant = 'default',
  children,
  className = '',
}) {
  const { mounted, state } = usePanelPresence(open);
  if (!mounted) return null;

  return (
    <div
      className={[
        'chat-side-panel',
        `chat-side-panel--${variant}`,
        state === 'open' ? 'is-open' : state === 'entering' ? 'is-entering' : 'is-closed',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="chat-side-panel__inner">{children}</div>
    </div>
  );
});

export const AnimatedCollapse = memo(function AnimatedCollapse({
  open,
  children,
  className = '',
}) {
  const { mounted, state } = usePanelPresence(open);
  if (!mounted) return null;

  return (
    <div
      className={[
        'chat-collapse-panel',
        state === 'open' ? 'is-open' : state === 'entering' ? 'is-entering' : 'is-closed',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="chat-collapse-panel__inner">{children}</div>
    </div>
  );
});
