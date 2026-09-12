export function zScore(currentValue, historicalValues) {
  const mean = historicalValues.reduce((sum, value) => sum + value, 0) / historicalValues.length;
  const variance =
    historicalValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / historicalValues.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) {
    return 0;
  }
  return (currentValue - mean) / stdDev;
}

export function normalizeProxies(rawProxies, historicalProxies) {
  const normalized = {};
  for (const [key, value] of Object.entries(rawProxies)) {
    const history = historicalProxies[key] ?? [];
    normalized[key] = history.length > 0 ? zScore(value, history) : 0;
  }
  return normalized;
}
