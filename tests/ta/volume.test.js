import { describe, expect, it } from "vitest";
import { obv, vwap } from "#ta/volume.js";

describe("obv", () => {
  it("adds volume on an up close, subtracts on a down close, holds on no change", () => {
    const bars = [
      { close: 10, volume: 100 },
      { close: 12, volume: 50 },
      { close: 11, volume: 30 },
      { close: 11, volume: 20 },
      { close: 15, volume: 40 },
    ];
    expect(obv(bars)).toEqual([0, 50, 20, 20, 60]);
  });
});

describe("vwap", () => {
  it("computes the cumulative volume-weighted typical price", () => {
    const bars = [
      { high: 12, low: 8, close: 10, volume: 100 },
      { high: 14, low: 10, close: 12, volume: 100 },
    ];
    expect(vwap(bars)).toEqual([10, 11]);
  });
});
