export function isRateLimitError(err) {
  return err?.status === 429;
}

export function getRateLimitDelayMs(err, fallbackMs = 1500) {
  const retryAfter = Number(err?.retryAfter);
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return fallbackMs;
  return Math.max(1000, Math.ceil(retryAfter * 1000));
}

export function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export const MESSAGE_SEND_QUEUE_GAP_MS = 250;
export const MESSAGE_SEND_BACKPRESSURE_LIMIT = 20;

export const RATE_LIMIT_EVENT = 'slide:message-rate-limit';

export function notifyRateLimit() {
  window.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT));
}
