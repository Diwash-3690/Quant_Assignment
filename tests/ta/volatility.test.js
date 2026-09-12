import { describe, expect, it } from "vitest";
import { atr, bollingerBands, trueRange } from "#ta/volatility.js";

const bars = [
  { high: 10, low: 8, close: 9 },
  { high: 11, low: 9, close: 10 },
  { high: 12, low: 8, close: 9 },
  { high: 10, low: 7, close: 8 },
];

describe("trueRange", () => {
  it("uses high-low for the first bar and the widest range thereafter", () => {
    expect(trueRange(bars)).toEqual([2, 2, 4, 3]);
  });
});

describe("atr", () => {
  it("applies Wilder smoothing to the true range series", () => {
    expect(atr(bars, 2)).toEqual([2, 3, 3]);
  });

  it("returns empty when there is not enough data", () => {
    expect(atr(bars.slice(0, 1), 2)).toEqual([]);
  });
});

describe("bollingerBands", () => {
  it("computes middle, upper, and lower bands from the rolling standard deviation", () => {
    expect(bollingerBands([10, 14, 18, 14], 2, 2)).toEqual([
      { middle: 12, upper: 16, lower: 8 },
      { middle: 16, upper: 20, lower: 12 },
      { middle: 16, upper: 20, lower: 12 },
    ]);
  });
});
