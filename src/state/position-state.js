import { OrderSide } from "#domain/order.js";
import { roundToPaisa } from "#domain/money.js";
import { createPosition } from "#domain/position.js";

export function applyFill(position, fill) {
  const signedFillQuantity = fill.side === OrderSide.BUY ? fill.quantity : -fill.quantity;
  const existingQuantity = position.netQuantity;

  if (existingQuantity === 0 || Math.sign(existingQuantity) === Math.sign(signedFillQuantity)) {
    const newQuantity = existingQuantity + signedFillQuantity;
    const newAveragePrice =
      existingQuantity === 0
        ? fill.price
        : roundToPaisa(
            (Math.abs(existingQuantity) * position.averagePrice + fill.quantity * fill.price) /
              Math.abs(newQuantity),
          );
    return createPosition({
      ...position,
      netQuantity: newQuantity,
      averagePrice: newAveragePrice,
      updatedAt: fill.filledAt,
    });
  }

  const closingQuantity = Math.min(Math.abs(existingQuantity), fill.quantity);
  const existingDirection = Math.sign(existingQuantity);
  const realizedDelta = roundToPaisa(
    existingDirection * (fill.price - position.averagePrice) * closingQuantity,
  );
  const newQuantity = existingQuantity + signedFillQuantity;
  const openingQuantity = fill.quantity - closingQuantity;

  return createPosition({
    ...position,
    netQuantity: newQuantity,
    averagePrice: newQuantity === 0 ? 0 : openingQuantity > 0 ? fill.price : position.averagePrice,
    realizedPnl: roundToPaisa(position.realizedPnl + realizedDelta),
    updatedAt: fill.filledAt,
  });
}

export function markToMarket(position, lastPrice, asOf) {
  return createPosition({
    ...position,
    unrealizedPnl: roundToPaisa(position.netQuantity * (lastPrice - position.averagePrice)),
    updatedAt: asOf,
  });
}

function flatPosition(tradingSymbol, exchange, asOf) {
  return {
    tradingSymbol,
    exchange,
    netQuantity: 0,
    averagePrice: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    updatedAt: asOf,
  };
}

export class PositionStateManager {
  constructor({ repository, clock = () => new Date().toISOString() }) {
    this.repository = repository;
    this.clock = clock;
  }

  async applyFill(tradingSymbol, exchange, fill) {
    const existing =
      (await this.repository.find(tradingSymbol, exchange)) ??
      flatPosition(tradingSymbol, exchange, this.clock());
    const updated = applyFill(existing, fill);
    await this.repository.upsert(updated);
    return updated;
  }

  async markToMarket(tradingSymbol, exchange, lastPrice) {
    const existing = await this.repository.find(tradingSymbol, exchange);
    if (!existing) {
      return null;
    }
    const updated = markToMarket(existing, lastPrice, this.clock());
    await this.repository.upsert(updated);
    return updated;
  }
}
