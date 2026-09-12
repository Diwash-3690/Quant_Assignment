import { describe, expect, it } from "vitest";
import { ema, sma } from "#ta/trend.js";

describe("sma", () => {
  it("computes a sliding average over the window", () => {
    expect(sma([1, 2, 3, 4, 5, 6], 3)).toEqual([2, 3, 4, 5]);
  });

  it("returns empty when there is not enough data", () => {
    expect(sma([1, 2], 3)).toEqual([]);
  });
});

describe("ema", () => {
  it("seeds with the SMA and applies the smoothing multiplier thereafter", () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
  });

  it("returns empty when there is not enough data", () => {
    expect(ema([1, 2], 3)).toEqual([]);
  });
});
