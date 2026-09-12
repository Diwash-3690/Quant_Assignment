import { describe, expect, it, vi } from "vitest";
import { createRateLimiter, withRetry, withTimeout } from "#broker/resilience.js";

describe("withTimeout", () => {
  it("resolves when the operation finishes before the deadline", async () => {
    const result = await withTimeout(() => Promise.resolve("ok"), 100);
    expect(result).toBe("ok");
  });

  it("rejects when the operation exceeds the deadline", async () => {
    const neverResolves = () => new Promise(() => {});
    await expect(withTimeout(neverResolves, 20)).rejects.toThrow(/timed out/);
  });
});

describe("withRetry", () => {
  it("retries a failing operation up to the configured limit", async () => {
    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("transient");
      }
      return "recovered";
    });

    const result = await withRetry(operation, { retries: 3, minTimeoutMs: 1 });
    expect(result).toBe("recovered");
    expect(attempts).toBe(3);
  });

  it("gives up after exhausting retries", async () => {
    const operation = vi.fn(async () => {
      throw new Error("permanent");
    });

    await expect(withRetry(operation, { retries: 2, minTimeoutMs: 1 })).rejects.toThrow("permanent");
    expect(operation).toHaveBeenCalledTimes(3);
  });
});

describe("createRateLimiter", () => {
  it("spaces out calls to respect the configured rate", async () => {
    const rateLimited = createRateLimiter(10);
    const start = Date.now();
    await rateLimited(() => Promise.resolve());
    await rateLimited(() => Promise.resolve());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });
});
