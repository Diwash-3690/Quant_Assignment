import { describe, expect, it } from "vitest";
import { normalizeProxies, zScore } from "#regime/proxies.js";

describe("zScore", () => {
  it("computes standard deviations from the mean", () => {
    expect(zScore(25, [10, 10, 20, 20])).toBe(2);
    expect(zScore(15, [10, 10, 20, 20])).toBe(0);
  });

  it("returns 0 when the historical series has no variance, avoiding division by zero", () => {
    expect(zScore(50, [10, 10, 10])).toBe(0);
  });
});

describe("normalizeProxies", () => {
  it("z-scores each proxy against its own history", () => {
    const result = normalizeProxies(
      { indiaVix: 25, usdInr: 83 },
      { indiaVix: [10, 10, 20, 20], usdInr: [] },
    );
    expect(result).toEqual({ indiaVix: 2, usdInr: 0 });
  });
});
