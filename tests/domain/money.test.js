import { describe, expect, it } from "vitest";
import { roundToPaisa, roundToTick } from "#domain/money.js";

describe("roundToTick", () => {
  it("rounds to the nearest tick", () => {
    expect(roundToTick(101.23, 0.05)).toBe(101.25);
    expect(roundToTick(101.21, 0.05)).toBe(101.2);
  });

  it("returns an exact tick unchanged", () => {
    expect(roundToTick(150.5, 0.5)).toBe(150.5);
  });

  it("avoids floating point drift", () => {
    expect(roundToTick(0.1 + 0.2, 0.01)).toBe(0.3);
  });
});

describe("roundToPaisa", () => {
  it("rounds to the nearest paisa", () => {
    expect(roundToPaisa(6294.2857142857)).toBe(6294.29);
    expect(roundToPaisa(0.1 + 0.2)).toBe(0.3);
  });
});
