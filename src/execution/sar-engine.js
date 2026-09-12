import { roundToTick } from "#domain/money.js";
import { OrderSide, OrderType } from "#domain/order.js";
import { applyFill as applyPositionFill } from "#state/position-state.js";
import { AlertSeverity, createAlert } from "#observability/alerts.js";
import { createTradeBlotterEntry, logTrade } from "#observability/logging.js";

export const SarDirection = Object.freeze({
  LONG: "LONG",
  SHORT: "SHORT",
});

function directionSign(direction) {
  return direction === SarDirection.LONG ? 1 : -1;
}

function oppositeDirection(direction) {
  return direction === SarDirection.LONG ? SarDirection.SHORT : SarDirection.LONG;
}

function entrySide(direction) {
  return direction === SarDirection.LONG ? OrderSide.BUY : OrderSide.SELL;
}

function closingSide(direction) {
  return direction === SarDirection.LONG ? OrderSide.SELL : OrderSide.BUY;
}

export function computeStopPrice(direction, favorablePrice, atr, config) {
  const distance = atr * config.stopMultiplier;
  return roundToTick(favorablePrice - directionSign(direction) * distance, config.tickSize);
}

export function evaluateKillSwitch(sarState, marketContext, config) {
  const totalPnl = marketContext.realizedPnl + marketContext.unrealizedPnl;
  if (totalPnl < -config.maxLossAmount) {
    return { triggered: true, reason: "max loss breached" };
  }
  if (Math.abs(sarState.position.netQuantity) > config.maxPositionQuantity) {
    return { triggered: true, reason: "position cap breached" };
  }
  return { triggered: false, reason: null };
}

export function decidePyramidAdd(sarState, marketContext, config) {
  if (sarState.pyramidCount >= config.maxPyramidLevels) {
    return null;
  }
  const favorableMove =
    directionSign(sarState.direction) * (marketContext.lastPrice - sarState.lastPyramidPrice);
  if (favorableMove < marketContext.atr * config.pyramidStepMultiplier) {
    return null;
  }
  if (Math.abs(sarState.position.netQuantity) + config.quantityPerAdd > config.maxPositionQuantity) {
    return null;
  }
  return { quantity: config.quantityPerAdd };
}

export class SarEngine {
  constructor({
    tradingSymbol,
    exchange,
    tickSize,
    orderStateManager,
    config,
    logger = console,
    alertDispatcher = { dispatch: async () => {} },
    clock = () => new Date().toISOString(),
  }) {
    this.tradingSymbol = tradingSymbol;
    this.exchange = exchange;
    this.tickSize = tickSize;
    this.orderStateManager = orderStateManager;
    this.config = config;
    this.logger = logger;
    this.alertDispatcher = alertDispatcher;
    this.clock = clock;
    this.state = null;
    this.cycle = 0;
  }

  buildKey(role) {
    return `sar-${this.tradingSymbol}-${role}-${this.cycle}-${this.state.pyramidCount}`;
  }

  openPosition(direction, entryPrice, quantity, atr, carriedRealizedPnl, filledAt) {
    this.cycle += 1;
    const flatWithHistory = {
      tradingSymbol: this.tradingSymbol,
      exchange: this.exchange,
      netQuantity: 0,
      averagePrice: 0,
      realizedPnl: carriedRealizedPnl,
      unrealizedPnl: 0,
      updatedAt: filledAt,
    };
    const position = applyPositionFill(flatWithHistory, {
      side: entrySide(direction),
      quantity,
      price: entryPrice,
      filledAt,
    });

    this.state = {
      direction,
      position,
      favorablePrice: entryPrice,
      lastPyramidPrice: entryPrice,
      pyramidCount: 0,
      stopPrice: computeStopPrice(direction, entryPrice, atr, { ...this.config, tickSize: this.tickSize }),
      currentStopKey: null,
      killSwitchActive: false,
    };
  }

  async start(direction, entryPrice, quantity, atr) {
    this.openPosition(direction, entryPrice, quantity, atr, 0, this.clock());
    await this.placeStopOrder();
  }

  async placeStopOrder() {
    const idempotencyKey = this.buildKey("stop");
    await this.orderStateManager.placeOrder({
      idempotencyKey,
      tradingSymbol: this.tradingSymbol,
      exchange: this.exchange,
      side: closingSide(this.state.direction),
      orderType: OrderType.SL_M,
      quantity: Math.abs(this.state.position.netQuantity),
      price: null,
      triggerPrice: this.state.stopPrice,
    });
    this.state.currentStopKey = idempotencyKey;
  }

  async onTick(marketContext) {
    if (!this.state) {
      throw new Error("sar engine has not been started");
    }
    if (this.state.killSwitchActive) {
      return { action: "kill-switch-active" };
    }

    const killSwitch = evaluateKillSwitch(this.state, marketContext, this.config);
    if (killSwitch.triggered) {
      return this.triggerKillSwitch(killSwitch.reason);
    }

    const sign = directionSign(this.state.direction);
    if (sign * (marketContext.lastPrice - this.state.favorablePrice) > 0) {
      this.state.favorablePrice = marketContext.lastPrice;
    }

    const pyramidAdd = decidePyramidAdd(this.state, marketContext, this.config);
    if (!pyramidAdd) {
      return { action: "no-op" };
    }

    await this.addPyramid(pyramidAdd.quantity, marketContext.lastPrice, marketContext.atr);
    return { action: "pyramided", quantity: pyramidAdd.quantity };
  }

  async addPyramid(quantity, price, atr) {
    const filledAt = this.clock();
    await this.orderStateManager.placeOrder({
      idempotencyKey: this.buildKey("add"),
      tradingSymbol: this.tradingSymbol,
      exchange: this.exchange,
      side: entrySide(this.state.direction),
      orderType: OrderType.MARKET,
      quantity,
      price: null,
      triggerPrice: null,
    });

    this.state.position = applyPositionFill(this.state.position, {
      side: entrySide(this.state.direction),
      quantity,
      price,
      filledAt,
    });
    this.state.lastPyramidPrice = price;

    logTrade(
      this.logger,
      createTradeBlotterEntry({
        idempotencyKey: this.buildKey("add"),
        brokerOrderId: null,
        tradingSymbol: this.tradingSymbol,
        exchange: this.exchange,
        side: entrySide(this.state.direction),
        quantity,
        price,
        cost: null,
        strategy: "sar-pyramid",
        filledAt,
      }),
    );

    const previousStopKey = this.state.currentStopKey;
    this.state.pyramidCount += 1;
    this.state.stopPrice = computeStopPrice(
      this.state.direction,
      this.state.favorablePrice,
      atr,
      { ...this.config, tickSize: this.tickSize },
    );

    await this.orderStateManager.cancelOrder(previousStopKey);
    await this.placeStopOrder();
  }

  async onStopFilled(fillPrice, atr) {
    const filledAt = this.clock();
    const closedPosition = applyPositionFill(this.state.position, {
      side: closingSide(this.state.direction),
      quantity: Math.abs(this.state.position.netQuantity),
      price: fillPrice,
      filledAt,
    });

    logTrade(
      this.logger,
      createTradeBlotterEntry({
        idempotencyKey: this.state.currentStopKey,
        brokerOrderId: null,
        tradingSymbol: this.tradingSymbol,
        exchange: this.exchange,
        side: closingSide(this.state.direction),
        quantity: Math.abs(this.state.position.netQuantity),
        price: fillPrice,
        cost: null,
        strategy: "sar-reverse",
        filledAt,
      }),
    );

    const newDirection = oppositeDirection(this.state.direction);
    this.openPosition(
      newDirection,
      fillPrice,
      this.config.reversalQuantity,
      atr,
      closedPosition.realizedPnl,
      filledAt,
    );
    await this.placeStopOrder();

    return { action: "reversed", direction: newDirection };
  }

  async triggerKillSwitch(reason) {
    this.state.killSwitchActive = true;
    if (this.state.currentStopKey) {
      await this.orderStateManager.cancelOrder(this.state.currentStopKey);
    }

    await this.orderStateManager.placeOrder({
      idempotencyKey: this.buildKey("flatten"),
      tradingSymbol: this.tradingSymbol,
      exchange: this.exchange,
      side: closingSide(this.state.direction),
      orderType: OrderType.MARKET,
      quantity: Math.abs(this.state.position.netQuantity),
      price: null,
      triggerPrice: null,
    });

    this.logger.warn({ tradingSymbol: this.tradingSymbol, reason }, "sar kill switch triggered");
    await this.alertDispatcher.dispatch(
      createAlert(
        {
          severity: AlertSeverity.CRITICAL,
          title: `SAR kill switch: ${this.tradingSymbol}`,
          message: reason,
          context: { tradingSymbol: this.tradingSymbol, exchange: this.exchange, direction: this.state.direction },
        },
        this.clock,
      ),
    );

    return { action: "kill-switch-triggered", reason };
  }
}
