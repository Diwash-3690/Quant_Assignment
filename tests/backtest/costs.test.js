import { describe, expect, it } from "vitest";
import { computeBrokerage, computeTransactionCost } from "#backtest/costs.js";

const config = {
  flatBrokerageFee: 20,
  brokeragePercent: 0.0003,
  statutoryChargeRate: 0.0005,
};

describe("computeBrokerage", () => {
  it("charges the percentage fee when it is lower than the flat fee", () => {
    expect(computeBrokerage(50000, config)).toBe(15);
  });

  it("caps the fee at the flat amount when the percentage fee would be higher", () => {
    expect(computeBrokerage(100000, config)).toBe(20);
  });
});

describe("computeTransactionCost", () => {
  it("sums brokerage and statutory charges", () => {
    expect(computeTransactionCost(100000, config)).toBe(70);
  });
});
