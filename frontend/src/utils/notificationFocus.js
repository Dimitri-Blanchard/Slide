/** True when the app tab/window is visible and focused — no notification chime in that case. */
export function isAppInForeground() {
  if (typeof document === 'undefined') return true;
  return !document.hidden && document.hasFocus();
}

export function shouldPlayNotificationSound({ force = false } = {}) {
  if (force) return true;
  return !isAppInForeground();
}
