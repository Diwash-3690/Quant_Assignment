import { OrderSide, OrderType } from "#domain/order.js";

function simulateLimitFill(order, bar) {
  if (order.side === OrderSide.BUY) {
    if (bar.low > order.price) {
      return { filled: false };
    }
    return { filled: true, price: bar.open <= order.price ? bar.open : order.price };
  }

  if (bar.high < order.price) {
    return { filled: false };
  }
  return { filled: true, price: bar.open >= order.price ? bar.open : order.price };
}

function simulateStopFill(order, bar) {
  if (order.side === OrderSide.SELL) {
    if (bar.low > order.triggerPrice) {
      return { filled: false };
    }
    return { filled: true, price: bar.open <= order.triggerPrice ? bar.open : order.triggerPrice };
  }

  if (bar.high < order.triggerPrice) {
    return { filled: false };
  }
  return { filled: true, price: bar.open >= order.triggerPrice ? bar.open : order.triggerPrice };
}

export function simulateFill(order, bar) {
  if (order.orderType === OrderType.MARKET) {
    return { filled: true, price: bar.open };
  }
  if (order.orderType === OrderType.LIMIT) {
    return simulateLimitFill(order, bar);
  }
  if (order.orderType === OrderType.SL_M) {
    return simulateStopFill(order, bar);
  }
  throw new Error(`fill simulation does not support order type: ${order.orderType}`);
}
