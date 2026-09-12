import { describe, expect, it } from "vitest";
import { RegimeState, scoreRegime } from "#regime/scorer.js";

describe("scoreRegime", () => {
  const weights = { proxyA: 1 };

  it("classifies crisis at or below -2", () => {
    expect(scoreRegime({ proxyA: -2 }, weights)).toEqual({ compositeScore: -2, state: RegimeState.CRISIS });
  });

  it("classifies risk-off strictly below -0.5", () => {
    expect(scoreRegime({ proxyA: -1 }, weights)).toEqual({ compositeScore: -1, state: RegimeState.RISK_OFF });
  });

  it("classifies exactly -0.5 as neutral, not risk-off (boundary is exclusive)", () => {
    expect(scoreRegime({ proxyA: -0.5 }, weights)).toEqual({
      compositeScore: -0.5,
      state: RegimeState.NEUTRAL,
    });
  });

  it("classifies neutral in the middle band", () => {
    expect(scoreRegime({ proxyA: 0 }, weights)).toEqual({ compositeScore: 0, state: RegimeState.NEUTRAL });
  });

  it("classifies exactly 0.5 as risk-on, not neutral (boundary is exclusive)", () => {
    expect(scoreRegime({ proxyA: 0.5 }, weights)).toEqual({
      compositeScore: 0.5,
      state: RegimeState.RISK_ON,
    });
  });

  it("weights and combines multiple proxies, and ignores an unweighted proxy", () => {
    const result = scoreRegime({ indiaVix: 2, usdInr: -1, unweighted: 100 }, { indiaVix: -1, usdInr: 0.5 });
    expect(result).toEqual({ compositeScore: -2.5, state: RegimeState.CRISIS });
  });
});
