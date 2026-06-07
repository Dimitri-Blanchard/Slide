/** Minimum clearance from viewport top (Electron title bar, etc.). */
export function getViewportTopInset(extraGap = 8) {
  if (typeof window === 'undefined') return extraGap;
  let inset = extraGap;
  const isElectron =
    document.documentElement.classList.contains('platform-electron') ||
    !!document.querySelector('.electron-title-bar');
  if (isElectron) {
    const h = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--electron-titlebar-height'),
    );
    inset = (Number.isFinite(h) && h > 0 ? h : 36) + extraGap;
  }
  return inset;
}

/**
 * Pick popover position above or below anchor, avoiding the top chrome.
 * Returns style props for a fixed, horizontally centered popover.
 */
export function computeAnchoredPopoverStyle(anchorRect, { gap = 12, estimatedHeight = 132 } = {}) {
  const topInset = getViewportTopInset();
  const spaceAbove = anchorRect.top - topInset;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const openAbove = spaceAbove >= estimatedHeight + gap || spaceAbove >= spaceBelow;

  const left = anchorRect.left + anchorRect.width / 2;

  if (openAbove) {
    return {
      left,
      bottom: window.innerHeight - anchorRect.top + gap,
      openAbove: true,
    };
  }

  return {
    left,
    top: anchorRect.bottom + gap,
    openAbove: false,
  };
}
