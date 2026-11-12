export const RECONNECT_BASE_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 30_000;
export const RECONNECT_STABLE_CONNECTION_MS = 30_000;

/**
 * Increase delay after short-lived failures, but reset after a connection that
 * stayed open long enough to be considered stable.
 */
export function nextReconnectDelay(
  previousDelayMs,
  connectionDurationMs,
  {
    baseDelayMs = RECONNECT_BASE_DELAY_MS,
    maxDelayMs = RECONNECT_MAX_DELAY_MS,
    stableConnectionMs = RECONNECT_STABLE_CONNECTION_MS,
  } = {},
) {
  for (const [name, value] of Object.entries({
    previousDelayMs, connectionDurationMs, baseDelayMs, maxDelayMs, stableConnectionMs,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative finite number.`);
    }
  }
  if (baseDelayMs < 1 || maxDelayMs < baseDelayMs || stableConnectionMs < 1) {
    throw new TypeError("Reconnect policy bounds are invalid.");
  }
  if (connectionDurationMs >= stableConnectionMs) return baseDelayMs;
  return Math.min(maxDelayMs, Math.max(baseDelayMs, previousDelayMs * 2));
}

export function waitForReconnect(delayMs, signal) {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    return Promise.reject(new TypeError("delayMs must be a non-negative finite number."));
  }
  if (signal?.aborted || delayMs === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
