const GAP = 6;
const PAD = 8;
export const REACTION_TOOLTIP_MAX_WIDTH = 340;

/** Scrollable chat area used to keep reaction tooltips inside the message column. */
export function getReactionTooltipBoundary(anchorEl) {
  if (!anchorEl) return null;
  return (
    anchorEl.closest('.message-list') ||
    anchorEl.closest('.message-list-container') ||
    anchorEl.closest('.chat-main-content') ||
    null
  );
}

function viewportBoundary() {
  return {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * Position a reaction tooltip above the anchor when possible, otherwise below.
 * Clamps within boundaryRect (message list / chat column).
 */
export function computeReactionTooltipPosition({
  anchorRect,
  tooltipWidth,
  tooltipHeight,
  boundaryRect,
  maxWidth = REACTION_TOOLTIP_MAX_WIDTH,
}) {
  const b = boundaryRect || viewportBoundary();
  const effectiveMaxWidth = Math.min(maxWidth, Math.max(120, b.right - b.left - PAD * 2));

  let top = anchorRect.top - tooltipHeight - GAP;
  let placement = 'top';

  if (top < b.top + PAD) {
    top = anchorRect.bottom + GAP;
    placement = 'bottom';
  }

  if (top + tooltipHeight > b.bottom - PAD) {
    if (placement === 'bottom') {
      top = Math.max(b.top + PAD, b.bottom - PAD - tooltipHeight);
    } else {
      const above = anchorRect.top - tooltipHeight - GAP;
      top = above >= b.top + PAD ? above : Math.max(b.top + PAD, b.bottom - PAD - tooltipHeight);
    }
  }

  let left = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2;
  if (left < b.left + PAD) left = b.left + PAD;
  if (left + tooltipWidth > b.right - PAD) {
    left = Math.max(b.left + PAD, b.right - PAD - tooltipWidth);
  }

  return {
    top: Math.round(top),
    left: Math.round(left),
    maxWidth: Math.round(effectiveMaxWidth),
    placement,
  };
}

export function measureReactionTooltip(anchorEl, tooltipEl) {
  const anchorRect = anchorEl.getBoundingClientRect();
  const boundaryEl = getReactionTooltipBoundary(anchorEl);
  const boundaryRect = boundaryEl?.getBoundingClientRect() || viewportBoundary();
  const preMaxWidth = Math.min(
    REACTION_TOOLTIP_MAX_WIDTH,
    Math.max(120, boundaryRect.right - boundaryRect.left - PAD * 2),
  );

  tooltipEl.style.maxWidth = `${preMaxWidth}px`;
  const tooltipRect = tooltipEl.getBoundingClientRect();

  return computeReactionTooltipPosition({
    anchorRect,
    tooltipWidth: tooltipRect.width,
    tooltipHeight: tooltipRect.height,
    boundaryRect,
    maxWidth: preMaxWidth,
  });
}
