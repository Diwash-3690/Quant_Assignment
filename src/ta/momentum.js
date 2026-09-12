function computeRsiValue(averageGain, averageLoss) {
  if (averageLoss === 0) {
    return 100;
  }
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function rsi(closes, period) {
  if (closes.length <= period) {
    return [];
  }

  const gains = [];
  const losses = [];
  for (let i = 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }

  let averageGain = gains.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  let averageLoss = losses.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const result = [computeRsiValue(averageGain, averageLoss)];

  for (let i = period; i < gains.length; i += 1) {
    averageGain = (averageGain * (period - 1) + gains[i]) / period;
    averageLoss = (averageLoss * (period - 1) + losses[i]) / period;
    result.push(computeRsiValue(averageGain, averageLoss));
  }

  return result;
}

export function roc(values, period) {
  const result = [];
  for (let i = period; i < values.length; i += 1) {
    const previous = values[i - period];
    result.push(((values[i] - previous) / previous) * 100);
  }
  return result;
}
