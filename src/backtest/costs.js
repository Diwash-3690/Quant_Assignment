import { roundToPaisa } from "#domain/money.js";

export function computeBrokerage(turnover, config) {
  const percentageFee = turnover * config.brokeragePercent;
  return roundToPaisa(Math.min(config.flatBrokerageFee, percentageFee));
}

export function computeTransactionCost(turnover, config) {
  const brokerage = computeBrokerage(turnover, config);
  const statutoryCharges = roundToPaisa(turnover * config.statutoryChargeRate);
  return roundToPaisa(brokerage + statutoryCharges);
}
