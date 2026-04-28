/**
 * Modal enter: no slide — overlays use `modal-enter-instant` (see modalEnterInstant.css).
 * Always instant so reopening a modal never plays LTR/RTR enter motion.
 */
export function useModalEnterAnimation(_modalId, _isOpen) {
  return true;
}
