import { describe, expect, it } from "vitest";
import { rsi, roc } from "#ta/momentum.js";

describe("rsi", () => {
  it("applies Wilder smoothing over alternating gains and losses", () => {
    expect(rsi([10, 11, 10, 11, 10, 11], 2)).toEqual([50, 75, 37.5, 68.75]);
  });

  it("returns 100 when there have been no losses at all", () => {
    expect(rsi([10, 11, 12, 13], 2)).toEqual([100, 100]);
  });

  it("returns 0 when there have been no gains at all", () => {
    expect(rsi([13, 12, 11, 10], 2)).toEqual([0, 0]);
  });

  it("returns empty when there is not enough data", () => {
    expect(rsi([10, 11], 2)).toEqual([]);
  });
});

describe("roc", () => {
  it("computes percentage change over the lookback period", () => {
    expect(roc([10, 20, 25, 40, 50], 2)).toEqual([150, 100, 100]);
  });

  it("returns empty when there is not enough data", () => {
    expect(roc([10, 20], 3)).toEqual([]);
  });
});
