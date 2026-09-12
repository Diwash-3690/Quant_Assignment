export function roundToTick(price, tickSize) {
  const ticks = Math.round(price / tickSize);
  return Number.parseFloat((ticks * tickSize).toFixed(8));
}

export function roundToPaisa(amount) {
  return Number.parseFloat(amount.toFixed(2));
}
