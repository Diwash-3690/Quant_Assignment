import { describe, expect, it } from "vitest";
import { evaluateCircuitBreakers, overridesForRegime } from "#regime/overrides.js";
import { RegimeState } from "#regime/scorer.js";

describe("overridesForRegime", () => {
  it("returns full-size, pyramiding-enabled overrides for risk-on and neutral", () => {
    expect(overridesForRegime(RegimeState.RISK_ON)).toEqual({
      positionCapMultiplier: 1,
      stopMultiplierAdjustment: 1,
      pyramidingEnabled: true,
    });
    expect(overridesForRegime(RegimeState.NEUTRAL)).toEqual({
      positionCapMultiplier: 1,
      stopMultiplierAdjustment: 1,
      pyramidingEnabled: true,
    });
  });

  it("halves position capacity and widens stops in risk-off, with pyramiding disabled", () => {
    expect(overridesForRegime(RegimeState.RISK_OFF)).toEqual({
      positionCapMultiplier: 0.5,
      stopMultiplierAdjustment: 1.5,
      pyramidingEnabled: false,
    });
  });

  it("zeroes out position capacity entirely in crisis", () => {
    expect(overridesForRegime(RegimeState.CRISIS)).toEqual({
      positionCapMultiplier: 0,
      stopMultiplierAdjustment: 2,
      pyramidingEnabled: false,
    });
  });

  it("throws for an unrecognized regime state", () => {
    expect(() => overridesForRegime("UNKNOWN")).toThrow("no overrides defined");
  });
});

describe("evaluateCircuitBreakers", () => {
  const thresholds = { indiaVix: { max: 35 }, tenYearYield: { min: 5, max: 8 } };

  it("does not trigger when every proxy is within bounds", () => {
    expect(evaluateCircuitBreakers({ indiaVix: 20, tenYearYield: 6 }, thresholds)).toEqual({
      triggered: false,
      breaches: [],
    });
  });

  it("triggers on a max breach", () => {
    expect(evaluateCircuitBreakers({ indiaVix: 40, tenYearYield: 6 }, thresholds)).toEqual({
      triggered: true,
      breaches: [{ proxy: "indiaVix", reason: "exceeded max threshold of 35", value: 40 }],
    });
  });

  it("triggers on a min breach", () => {
    expect(evaluateCircuitBreakers({ indiaVix: 20, tenYearYield: 4 }, thresholds)).toEqual({
      triggered: true,
      breaches: [{ proxy: "tenYearYield", reason: "fell below min threshold of 5", value: 4 }],
    });
  });

  it("skips a threshold whose proxy value was not supplied", () => {
    expect(evaluateCircuitBreakers({ indiaVix: 20 }, thresholds)).toEqual({
      triggered: false,
      breaches: [],
    });
  });
});
