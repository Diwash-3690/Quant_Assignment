export function sma(values, period) {
  if (values.length < period) {
    return [];
  }

  const result = [];
  let windowSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    windowSum += values[i];
    if (i >= period) {
      windowSum -= values[i - period];
    }
    if (i >= period - 1) {
      result.push(windowSum / period);
    }
  }
  return result;
}

export function ema(values, period) {
  if (values.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const result = [seed];

  for (let i = period; i < values.length; i += 1) {
    const previous = result[result.length - 1];
    result.push((values[i] - previous) * multiplier + previous);
  }

  return result;
}
