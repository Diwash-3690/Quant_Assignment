import { describe, expect, it } from "vitest";
import { BacktestRunner, SimulatedBroker } from "#backtest/engine.js";
import { Exchange } from "#domain/instrument.js";
import { OrderSide, OrderStatus, OrderType } from "#domain/order.js";

const costConfig = { flatBrokerageFee: 20, brokeragePercent: 0.0003, statutoryChargeRate: 0.0005 };

const sampleOrder = {
  idempotencyKey: "test-1",
  tradingSymbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  side: OrderSide.BUY,
  orderType: OrderType.LIMIT,
  quantity: 10,
  price: 100,
  triggerPrice: null,
};

describe("SimulatedBroker", () => {
  it("holds a placed order as pending until a bar fills it", async () => {
    const broker = new SimulatedBroker({ costConfig });
    const brokerOrderId = await broker.placeOrder(sampleOrder);

    expect(brokerOrderId).toBe("sim-1");
    expect(broker.pendingOrders.has("sim-1")).toBe(true);

    broker.setCurrentBar({ open: 105, high: 106, low: 98, close: 102 });
    const fills = broker.evaluatePendingOrders();

    expect(fills).toEqual([
      { brokerOrderId: "sim-1", order: expect.objectContaining(sampleOrder), price: 100, cost: 0.8 },
    ]);
    expect(broker.pendingOrders.has("sim-1")).toBe(false);
  });

  it("removes a cancelled order without ever filling it", async () => {
    const broker = new SimulatedBroker({ costConfig });
    const brokerOrderId = await broker.placeOrder(sampleOrder);
    await broker.cancelOrder(brokerOrderId);

    broker.setCurrentBar({ open: 90, high: 92, low: 88, close: 91 });
    expect(broker.evaluatePendingOrders()).toEqual([]);
  });

  it("exposes completed fills through fetchOrders", async () => {
    const broker = new SimulatedBroker({ costConfig });
    await broker.placeOrder(sampleOrder);
    broker.setCurrentBar({ open: 105, high: 106, low: 98, close: 102 });
    broker.evaluatePendingOrders();

    const orders = await broker.fetchOrders();
    expect(orders).toEqual([
      expect.objectContaining({ idempotencyKey: "test-1", status: OrderStatus.COMPLETE }),
    ]);
  });
});

describe("BacktestRunner", () => {
  it("never fills an order against the same bar it was placed on", async () => {
    const broker = new SimulatedBroker({ costConfig });
    const bars = [
      { open: 100, high: 102, low: 99, close: 101 },
      { open: 101, high: 103, low: 100, close: 102 },
      { open: 102, high: 104, low: 101, close: 103 },
    ];
    const runner = new BacktestRunner({ broker, bars });
    const fillCountsByBar = [];
    let hasPlacedOrder = false;

    await runner.run(async (bar, fills) => {
      fillCountsByBar.push(fills.length);
      if (!hasPlacedOrder) {
        await broker.placeOrder(sampleOrder);
        hasPlacedOrder = true;
      }
    });

    expect(fillCountsByBar).toEqual([0, 1, 0]);
  });

  it("calls onBar once per bar, in order, with accumulating history", async () => {
    const broker = new SimulatedBroker({ costConfig });
    const bars = [
      { open: 100, high: 101, low: 99, close: 100 },
      { open: 100, high: 101, low: 99, close: 100 },
    ];
    const runner = new BacktestRunner({ broker, bars });
    const seenBars = [];

    const history = await runner.run(async (bar, _fills, historySoFar) => {
      seenBars.push(bar);
      expect(historySoFar.length).toBe(seenBars.length);
    });

    expect(seenBars).toEqual(bars);
    expect(history.length).toBe(2);
  });
});
