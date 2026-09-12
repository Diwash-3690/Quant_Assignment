import { sma } from "#ta/trend.js";

export function trueRange(bars) {
  const result = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i === 0) {
      result.push(bars[i].high - bars[i].low);
      continue;
    }
    const previousClose = bars[i - 1].close;
    const highLow = bars[i].high - bars[i].low;
    const highPrevClose = Math.abs(bars[i].high - previousClose);
    const lowPrevClose = Math.abs(bars[i].low - previousClose);
    result.push(Math.max(highLow, highPrevClose, lowPrevClose));
  }
  return result;
}

export function atr(bars, period) {
  const trueRanges = trueRange(bars);
  if (trueRanges.length < period) {
    return [];
  }

  let average = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const result = [average];

  for (let i = period; i < trueRanges.length; i += 1) {
    average = (average * (period - 1) + trueRanges[i]) / period;
    result.push(average);
  }

  return result;
}

export function bollingerBands(values, period, stdDevMultiplier) {
  const middle = sma(values, period);
  const result = [];

  for (let i = 0; i < middle.length; i += 1) {
    const window = values.slice(i, i + period);
    const mean = middle[i];
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    result.push({
      middle: mean,
      upper: mean + stdDevMultiplier * stdDev,
      lower: mean - stdDevMultiplier * stdDev,
    });
  }

  return result;
}
