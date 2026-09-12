import { RegimeState } from "#regime/scorer.js";

export const REGIME_OVERRIDES = Object.freeze({
  [RegimeState.RISK_ON]: { positionCapMultiplier: 1, stopMultiplierAdjustment: 1, pyramidingEnabled: true },
  [RegimeState.NEUTRAL]: { positionCapMultiplier: 1, stopMultiplierAdjustment: 1, pyramidingEnabled: true },
  [RegimeState.RISK_OFF]: {
    positionCapMultiplier: 0.5,
    stopMultiplierAdjustment: 1.5,
    pyramidingEnabled: false,
  },
  [RegimeState.CRISIS]: { positionCapMultiplier: 0, stopMultiplierAdjustment: 2, pyramidingEnabled: false },
});

export function overridesForRegime(regimeState) {
  const overrides = REGIME_OVERRIDES[regimeState];
  if (!overrides) {
    throw new Error(`no overrides defined for regime state: ${regimeState}`);
  }
  return overrides;
}

export function evaluateCircuitBreakers(rawProxies, thresholds) {
  const breaches = [];
  for (const [key, threshold] of Object.entries(thresholds)) {
    const value = rawProxies[key];
    if (value === undefined) {
      continue;
    }
    if (threshold.max !== undefined && value > threshold.max) {
      breaches.push({ proxy: key, reason: `exceeded max threshold of ${threshold.max}`, value });
    }
    if (threshold.min !== undefined && value < threshold.min) {
      breaches.push({ proxy: key, reason: `fell below min threshold of ${threshold.min}`, value });
    }
  }
  return { triggered: breaches.length > 0, breaches };
}
