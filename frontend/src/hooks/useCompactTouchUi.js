import { useState, useEffect } from 'react';

/** True when we should expose touch-first patterns (tap/long-press, inline ⋯), not only desktop hover. */
export function useCompactTouchUi() {
  const query = '(max-width: 1024px), (hover: none)';
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}
