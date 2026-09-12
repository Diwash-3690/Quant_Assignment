import pino from "pino";

export function createLogger({ service, level = "info" }) {
  return pino({ level, base: { service } });
}

export function createTradeBlotterEntry({
  idempotencyKey,
  brokerOrderId,
  tradingSymbol,
  exchange,
  side,
  quantity,
  price,
  cost,
  strategy,
  filledAt,
}) {
  return {
    idempotencyKey,
    brokerOrderId,
    tradingSymbol,
    exchange,
    side,
    quantity,
    price,
    cost,
    strategy,
    filledAt,
  };
}

export function logTrade(logger, entry) {
  logger.info({ blotter: entry }, "trade executed");
}
