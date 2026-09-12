import { createInstrument, Exchange, Segment } from "#domain/instrument.js";
import { OrderRepository } from "#state/order-repository.js";
import { OrderStateManager } from "#state/order-state.js";
import { PositionRepository } from "#state/position-repository.js";
import { markToMarket, PositionStateManager } from "#state/position-state.js";
import { BacktestRunner, SimulatedBroker } from "#backtest/engine.js";
import { GridEngine } from "#execution/grid-engine.js";
import { atr as computeAtr } from "#ta/volatility.js";

class InMemoryOrderRepository extends OrderRepository {
  constructor() {
    super();
    this.ordersByKey = new Map();
  }

  async save(order) {
    if (!this.ordersByKey.has(order.idempotencyKey)) {
      this.ordersByKey.set(order.idempotencyKey, order);
    }
  }

  async findByIdempotencyKey(idempotencyKey) {
    return this.ordersByKey.get(idempotencyKey) ?? null;
  }

  async findByBrokerOrderId(brokerOrderId) {
    for (const order of this.ordersByKey.values()) {
      if (order.brokerOrderId === brokerOrderId) {
        return order;
      }
    }
    return null;
  }

  async update(idempotencyKey, changes) {
    const existing = this.ordersByKey.get(idempotencyKey);
    if (existing) {
      this.ordersByKey.set(idempotencyKey, { ...existing, ...changes });
    }
  }

  async findAllOpen() {
    return [...this.ordersByKey.values()].filter((order) =>
      ["PENDING", "OPEN"].includes(order.status),
    );
  }
}

class InMemoryPositionRepository extends PositionRepository {
  constructor() {
    super();
    this.positionsByKey = new Map();
  }

  keyFor(tradingSymbol, exchange) {
    return `${exchange}:${tradingSymbol}`;
  }

  async find(tradingSymbol, exchange) {
    return this.positionsByKey.get(this.keyFor(tradingSymbol, exchange)) ?? null;
  }

  async upsert(position) {
    this.positionsByKey.set(this.keyFor(position.tradingSymbol, position.exchange), position);
  }

  async findAll() {
    return [...this.positionsByKey.values()];
  }
}

function generateSyntheticBars(count, startPrice) {
  const bars = [];
  let previousClose = startPrice;
  for (let i = 0; i < count; i += 1) {
    const drift = Math.sin(i / 5) * 25;
    const open = previousClose;
    const close = startPrice + drift + (i % 2 === 0 ? 6 : -6);
    const high = Math.max(open, close) + 4;
    const low = Math.min(open, close) - 4;
    bars.push({ open, high, low, close, volume: 1000 });
    previousClose = close;
  }
  return bars;
}

function isEntryKey(idempotencyKey) {
  return idempotencyKey.includes("-entry-");
}

function isExitKey(idempotencyKey) {
  return idempotencyKey.includes("-exit-");
}

async function main() {
  const instrument = createInstrument({
    instrumentToken: 408065,
    tradingSymbol: "CRUDEOIL25DECFUT",
    exchange: Exchange.MCX,
    segment: Segment.FUTURES,
    lotSize: 100,
    tickSize: 1,
    expiry: "2025-12-19",
  });

  const atrPeriod = 14;
  const warmupBarCount = atrPeriod + 1;
  const simulationBarCount = 40;
  const allBars = generateSyntheticBars(warmupBarCount + simulationBarCount, 6250);
  const warmupBars = allBars.slice(0, warmupBarCount);
  const simulationBars = allBars.slice(warmupBarCount);

  const atrSeries = computeAtr(warmupBars, atrPeriod);
  const initialAtr = atrSeries[atrSeries.length - 1];
  const initialReferencePrice = warmupBars[warmupBars.length - 1].close;

  const costConfig = { flatBrokerageFee: 20, brokeragePercent: 0.0003, statutoryChargeRate: 0.0005 };
  const broker = new SimulatedBroker({ costConfig });

  const orderRepository = new InMemoryOrderRepository();
  const orderStateManager = new OrderStateManager({ broker, repository: orderRepository });

  const positionRepository = new InMemoryPositionRepository();
  const positionStateManager = new PositionStateManager({ repository: positionRepository });

  const gridConfig = {
    spacingMultiplier: 1,
    legsPerSide: 2,
    quantityPerLeg: 100,
    maxPositionQuantityPerSide: 300,
    maxLegsPerSide: 4,
    maxDeviationSpacings: 3,
    maxLossAmount: 25000,
  };

  const gridEngine = new GridEngine({
    tradingSymbol: instrument.tradingSymbol,
    exchange: instrument.exchange,
    tickSize: instrument.tickSize,
    orderStateManager,
    config: gridConfig,
  });
  gridEngine.start(initialReferencePrice, initialAtr);

  const runner = new BacktestRunner({ broker, bars: simulationBars });

  await runner.run(async (bar, fills) => {
    for (const fill of fills) {
      await positionStateManager.applyFill(instrument.tradingSymbol, instrument.exchange, {
        side: fill.order.side,
        quantity: fill.order.quantity,
        price: fill.price,
        filledAt: new Date().toISOString(),
      });

      if (isEntryKey(fill.order.idempotencyKey)) {
        await gridEngine.onEntryFilled(fill.order.idempotencyKey);
      } else if (isExitKey(fill.order.idempotencyKey)) {
        await gridEngine.onExitFilled(fill.order.idempotencyKey, fill.price);
      }
    }

    const currentPosition = await positionRepository.find(instrument.tradingSymbol, instrument.exchange);
    const realizedPnl = currentPosition?.realizedPnl ?? 0;
    const unrealizedPnl = currentPosition
      ? markToMarket(currentPosition, bar.close, new Date().toISOString()).unrealizedPnl
      : 0;

    await gridEngine.onTick({ lastPrice: bar.close, realizedPnl, unrealizedPnl });
  });

  const finalPosition = await positionRepository.find(instrument.tradingSymbol, instrument.exchange);
  const filledOrders = await broker.fetchOrders();

  console.log(`Instrument: ${instrument.tradingSymbol} (${instrument.exchange})`);
  console.log(`Warmup bars: ${warmupBars.length}, simulated bars: ${simulationBars.length}`);
  console.log(`Initial grid reference: ${initialReferencePrice}, ATR: ${initialAtr}`);
  console.log(`Orders filled: ${filledOrders.length}`);
  console.log("Final position:", finalPosition ?? "flat");
}

main().catch((error) => {
  console.error("backtest run failed:", error);
  process.exitCode = 1;
});
