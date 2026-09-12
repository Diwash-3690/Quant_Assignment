import pRetry from "p-retry";

export function withTimeout(operation, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function withRetry(operation, { retries = 3, minTimeoutMs = 500, factor = 2 } = {}) {
  return pRetry(operation, { retries, minTimeout: minTimeoutMs, factor });
}

export function createRateLimiter(maxCallsPerSecond) {
  const minIntervalMs = 1000 / maxCallsPerSecond;
  let earliestNextCallAt = 0;

  return async function rateLimited(operation) {
    const now = Date.now();
    const waitMs = Math.max(0, earliestNextCallAt - now);
    earliestNextCallAt = Math.max(now, earliestNextCallAt) + minIntervalMs;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    return operation();
  };
}
