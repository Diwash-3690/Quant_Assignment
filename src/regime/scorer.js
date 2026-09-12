export const RegimeState = Object.freeze({
  RISK_ON: "RISK_ON",
  NEUTRAL: "NEUTRAL",
  RISK_OFF: "RISK_OFF",
  CRISIS: "CRISIS",
});

function classifyRegime(compositeScore) {
  if (compositeScore <= -2) {
    return RegimeState.CRISIS;
  }
  if (compositeScore < -0.5) {
    return RegimeState.RISK_OFF;
  }
  if (compositeScore < 0.5) {
    return RegimeState.NEUTRAL;
  }
  return RegimeState.RISK_ON;
}

export function scoreRegime(normalizedProxies, weights) {
  let compositeScore = 0;
  for (const [key, value] of Object.entries(normalizedProxies)) {
    compositeScore += value * (weights[key] ?? 0);
  }
  return { compositeScore, state: classifyRegime(compositeScore) };
}
