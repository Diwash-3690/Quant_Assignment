import { roundToTick } from "#domain/money.js";
import { OrderSide, OrderType } from "#domain/order.js";
import { AlertSeverity, createAlert } from "#observability/alerts.js";
import { createTradeBlotterEntry, logTrade } from "#observability/logging.js";

export const GridLegStatus = Object.freeze({
  PENDING: "PENDING",
  OPEN: "OPEN",
  FILLED: "FILLED",
  CLOSED: "CLOSED",
});

export const GRID_LEG_TRANSITIONS = Object.freeze({
  [GridLegStatus.PENDING]: [GridLegStatus.OPEN],
  [GridLegStatus.OPEN]: [GridLegStatus.FILLED],
  [GridLegStatus.FILLED]: [GridLegStatus.CLOSED],
  [GridLegStatus.CLOSED]: [GridLegStatus.PENDING],
});

export function assertValidGridLegTransition(fromStatus, toStatus) {
  if (!GRID_LEG_TRANSITIONS[fromStatus]?.includes(toStatus)) {
    throw new Error(`illegal grid leg transition: ${fromStatus} -> ${toStatus}`);
  }
}

export function buildIdempotencyKey(tradingSymbol, offset, cycle, role) {
  return `grid-${tradingSymbol}-${offset}-${role}-${cycle}`;
}

export function buildGridLevels({ referencePrice, gridSpacing, tickSize, legsPerSide, quantityPerLeg }) {
  const legs = [];
  for (let distance = 1; distance <= legsPerSide; distance += 1) {
    legs.push({
      offset: -distance,
      price: roundToTick(referencePrice - distance * gridSpacing, tickSize),
      side: OrderSide.BUY,
      status: GridLegStatus.PENDING,
      quantity: quantityPerLeg,
      cycle: 0,
    });
    legs.push({
      offset: distance,
      price: roundToTick(referencePrice + distance * gridSpacing, tickSize),
      side: OrderSide.SELL,
      status: GridLegStatus.PENDING,
      quantity: quantityPerLeg,
      cycle: 0,
    });
  }
  return legs;
}

export function evaluateKillSwitch(gridState, marketContext, config) {
  const priceDeviation = Math.abs(marketContext.lastPrice - gridState.referencePrice);
  const maxDeviation = config.maxDeviationSpacings * gridState.gridSpacing;
  if (priceDeviation > maxDeviation) {
    return { triggered: true, reason: "price moved beyond max grid deviation" };
  }

  const totalPnl = marketContext.realizedPnl + marketContext.unrealizedPnl;
  if (totalPnl < -config.maxLossAmount) {
    return { triggered: true, reason: "max loss breached" };
  }

  return { triggered: false, reason: null };
}

function sideExposure(legs, side) {
  return legs
    .filter((leg) => leg.side === side && [GridLegStatus.OPEN, GridLegStatus.FILLED].includes(leg.status))
    .reduce((sum, leg) => sum + leg.quantity, 0);
}

export function decidePendingEntries(gridState, config) {
  let buyExposure = sideExposure(gridState.legs, OrderSide.BUY);
  let sellExposure = sideExposure(gridState.legs, OrderSide.SELL);

  const entries = [];
  for (const leg of gridState.legs) {
    if (leg.status !== GridLegStatus.PENDING) {
      continue;
    }
    if (leg.side === OrderSide.BUY) {
      if (buyExposure + leg.quantity > config.maxPositionQuantityPerSide) {
        continue;
      }
      buyExposure += leg.quantity;
    } else {
      if (sellExposure + leg.quantity > config.maxPositionQuantityPerSide) {
        continue;
      }
      sellExposure += leg.quantity;
    }
    entries.push(leg);
  }
  return entries;
}

export function extendGridIfNeeded(gridState, config) {
  const newLegs = [];

  const buyLegs = gridState.legs.filter((leg) => leg.side === OrderSide.BUY);
  const allBuyLegsFilled =
    buyLegs.length > 0 && buyLegs.every((leg) => leg.status === GridLegStatus.FILLED);
  if (allBuyLegsFilled && buyLegs.length < config.maxLegsPerSide) {
    const nextOffset = Math.min(...buyLegs.map((leg) => leg.offset)) - 1;
    newLegs.push({
      offset: nextOffset,
      price: roundToTick(
        gridState.referencePrice + nextOffset * gridState.gridSpacing,
        config.tickSize,
      ),
      side: OrderSide.BUY,
      status: GridLegStatus.PENDING,
      quantity: config.quantityPerLeg,
      cycle: 0,
    });
  }

  const sellLegs = gridState.legs.filter((leg) => leg.side === OrderSide.SELL);
  const allSellLegsFilled =
    sellLegs.length > 0 && sellLegs.every((leg) => leg.status === GridLegStatus.FILLED);
  if (allSellLegsFilled && sellLegs.length < config.maxLegsPerSide) {
    const nextOffset = Math.max(...sellLegs.map((leg) => leg.offset)) + 1;
    newLegs.push({
      offset: nextOffset,
      price: roundToTick(
        gridState.referencePrice + nextOffset * gridState.gridSpacing,
        config.tickSize,
      ),
      side: OrderSide.SELL,
      status: GridLegStatus.PENDING,
      quantity: config.quantityPerLeg,
      cycle: 0,
    });
  }

  return newLegs;
}

export function computeExitOrder(filledLeg, gridState, config) {
  const exitDirection = filledLeg.side === OrderSide.BUY ? 1 : -1;
  const exitPrice = roundToTick(
    filledLeg.price + exitDirection * gridState.gridSpacing,
    config.tickSize,
  );
  return {
    side: filledLeg.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY,
    price: exitPrice,
    quantity: filledLeg.quantity,
  };
}

export class GridEngine {
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
    this.legsByEntryKey = new Map();
    this.legsByExitKey = new Map();
  }

  start(referencePrice, atr) {
    const gridSpacing = roundToTick(atr * this.config.spacingMultiplier, this.tickSize);
    const legs = buildGridLevels({
      referencePrice,
      gridSpacing,
      tickSize: this.tickSize,
      legsPerSide: this.config.legsPerSide,
      quantityPerLeg: this.config.quantityPerLeg,
    });
    this.state = { referencePrice, gridSpacing, legs, killSwitchActive: false };
    this.legsByEntryKey.clear();
    this.legsByExitKey.clear();
  }

  async onTick(marketContext) {
    if (!this.state) {
      throw new Error("grid engine has not been started");
    }
    if (this.state.killSwitchActive) {
      return { action: "kill-switch-active" };
    }

    const killSwitch = evaluateKillSwitch(this.state, marketContext, this.config);
    if (killSwitch.triggered) {
      return this.triggerKillSwitch(killSwitch.reason);
    }

    for (const leg of extendGridIfNeeded(this.state, { ...this.config, tickSize: this.tickSize })) {
      this.state.legs.push(leg);
    }

    const entries = decidePendingEntries(this.state, this.config);
    for (const leg of entries) {
      await this.placeEntryOrder(leg);
    }

    return { action: "entries-evaluated", placed: entries.length };
  }

  async placeEntryOrder(leg) {
    const idempotencyKey = buildIdempotencyKey(this.tradingSymbol, leg.offset, leg.cycle, "entry");
    await this.orderStateManager.placeOrder({
      idempotencyKey,
      tradingSymbol: this.tradingSymbol,
      exchange: this.exchange,
      side: leg.side,
      orderType: OrderType.LIMIT,
      quantity: leg.quantity,
      price: leg.price,
      triggerPrice: null,
    });
    assertValidGridLegTransition(leg.status, GridLegStatus.OPEN);
    leg.status = GridLegStatus.OPEN;
    this.legsByEntryKey.set(idempotencyKey, leg);
  }

  async onEntryFilled(idempotencyKey) {
    const leg = this.legsByEntryKey.get(idempotencyKey);
    if (!leg) {
      throw new Error(`no grid leg found for entry idempotency key: ${idempotencyKey}`);
    }
    assertValidGridLegTransition(leg.status, GridLegStatus.FILLED);
    leg.status = GridLegStatus.FILLED;

    logTrade(
      this.logger,
      createTradeBlotterEntry({
        idempotencyKey,
        brokerOrderId: null,
        tradingSymbol: this.tradingSymbol,
        exchange: this.exchange,
        side: leg.side,
        quantity: leg.quantity,
        price: leg.price,
        cost: null,
        strategy: "grid-entry",
        filledAt: this.clock(),
      }),
    );

    const exit = computeExitOrder(leg, this.state, { tickSize: this.tickSize });
    const exitIdempotencyKey = buildIdempotencyKey(this.tradingSymbol, leg.offset, leg.cycle, "exit");
    await this.orderStateManager.placeOrder({
      idempotencyKey: exitIdempotencyKey,
      tradingSymbol: this.tradingSymbol,
      exchange: this.exchange,
      side: exit.side,
      orderType: OrderType.LIMIT,
      quantity: exit.quantity,
      price: exit.price,
      triggerPrice: null,
    });
    this.legsByExitKey.set(exitIdempotencyKey, leg);
  }

  async onExitFilled(idempotencyKey, fillPrice) {
    const leg = this.legsByExitKey.get(idempotencyKey);
    if (!leg) {
      throw new Error(`no grid leg found for exit idempotency key: ${idempotencyKey}`);
    }
    assertValidGridLegTransition(leg.status, GridLegStatus.CLOSED);
    leg.status = GridLegStatus.CLOSED;
    this.legsByExitKey.delete(idempotencyKey);

    logTrade(
      this.logger,
      createTradeBlotterEntry({
        idempotencyKey,
        brokerOrderId: null,
        tradingSymbol: this.tradingSymbol,
        exchange: this.exchange,
        side: leg.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY,
        quantity: leg.quantity,
        price: fillPrice,
        cost: null,
        strategy: "grid-exit",
        filledAt: this.clock(),
      }),
    );

    leg.cycle += 1;
    assertValidGridLegTransition(leg.status, GridLegStatus.PENDING);
    leg.status = GridLegStatus.PENDING;
  }

  async triggerKillSwitch(reason) {
    this.state.killSwitchActive = true;
    const flattened = [];

    for (const leg of this.state.legs) {
      if (leg.status === GridLegStatus.OPEN) {
        const entryKey = buildIdempotencyKey(this.tradingSymbol, leg.offset, leg.cycle, "entry");
        await this.orderStateManager.cancelOrder(entryKey);
      }

      if (leg.status === GridLegStatus.FILLED) {
        const exitKey = buildIdempotencyKey(this.tradingSymbol, leg.offset, leg.cycle, "exit");
        if (this.legsByExitKey.has(exitKey)) {
          await this.orderStateManager.cancelOrder(exitKey);
        }

        const flattenKey = buildIdempotencyKey(this.tradingSymbol, leg.offset, leg.cycle, "flatten");
        await this.orderStateManager.placeOrder({
          idempotencyKey: flattenKey,
          tradingSymbol: this.tradingSymbol,
          exchange: this.exchange,
          side: leg.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY,
          orderType: OrderType.MARKET,
          quantity: leg.quantity,
          price: null,
          triggerPrice: null,
        });
        flattened.push(leg.offset);
      }
    }

    this.logger.warn({ tradingSymbol: this.tradingSymbol, reason }, "grid kill switch triggered");
    await this.alertDispatcher.dispatch(
      createAlert(
        {
          severity: AlertSeverity.CRITICAL,
          title: `Grid kill switch: ${this.tradingSymbol}`,
          message: reason,
          context: { tradingSymbol: this.tradingSymbol, exchange: this.exchange, flattened },
        },
        this.clock,
      ),
    );

    return { action: "kill-switch-triggered", reason, flattened };
  }
}
