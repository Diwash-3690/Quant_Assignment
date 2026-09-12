export function obv(bars) {
  const result = [0];
  for (let i = 1; i < bars.length; i += 1) {
    const previous = result[result.length - 1];
    if (bars[i].close > bars[i - 1].close) {
      result.push(previous + bars[i].volume);
    } else if (bars[i].close < bars[i - 1].close) {
      result.push(previous - bars[i].volume);
    } else {
      result.push(previous);
    }
  }
  return result;
}

export function vwap(bars) {
  const result = [];
  let cumulativeVolume = 0;
  let cumulativeTurnover = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTurnover += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
    result.push(cumulativeVolume === 0 ? typicalPrice : cumulativeTurnover / cumulativeVolume);
  }

  return result;
}
