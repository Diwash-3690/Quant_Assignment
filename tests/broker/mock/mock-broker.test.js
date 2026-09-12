import { describe, it, expect, beforeEach } from "vitest";
import { MockBroker } from "#broker/mock/mock-broker.js";
import { OrderSide, OrderStatus, OrderType } from "#domain/order.js";

function createFakePriceFeed() {
  const listeners = new Set();
  return {
    lastPrice: 6500,
    onTick(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {},
    stop() {},
    emit(price) {
      this.lastPrice = price;
      const tick = { instrument_token: 1, last_price: price };
      for (const listener of listeners) {
        listener(tick);
      }
    },
  };
}

function buildOrder(overrides = {}) {
  return {
    idempotencyKey: "grid-CRUDEOIL-entry-1",
    tradingSymbol: "CRUDEOIL25DECFUT",
    exchange: "MCX",
    side: OrderSide.BUY,
    orderType: OrderType.LIMIT,
    quantity: 100,
    price: 6480,
    ...overrides,
  };
}

describe("MockBroker", () => {
  let priceFeed;
  let broker;

  beforeEach(async () => {
    priceFeed = createFakePriceFeed();
    broker = new MockBroker({ priceFeed, tickSize: 1 });
    await broker.connect();
  });

  it("keeps a limit order open until the price crosses it", async () => {
    const order = buildOrder();
    const brokerOrderId = await broker.placeOrder(order);

    priceFeed.emit(6490);
    let [fetched] = await broker.fetchOrders();
    expect(fetched.status).toBe(OrderStatus.OPEN);

    priceFeed.emit(6480);
    [fetched] = await broker.fetchOrders();
    expect(fetched.status).toBe(OrderStatus.COMPLETE);
    expect(fetched.brokerOrderId).toBe(brokerOrderId);
  });

  it("fills a sell limit only once price rises to or above the limit price", async () => {
    await broker.placeOrder(buildOrder({ side: OrderSide.SELL, price: 6520 }));

    priceFeed.emit(6510);
    let [fetched] = await broker.fetchOrders();
    expect(fetched.status).toBe(OrderStatus.OPEN);

    priceFeed.emit(6525);
    [fetched] = await broker.fetchOrders();
    expect(fetched.status).toBe(OrderStatus.COMPLETE);
  });

  it("fills market orders immediately at the current price", async () => {
    priceFeed.lastPrice = 6501;
    await broker.placeOrder(buildOrder({ orderType: OrderType.MARKET, price: null }));

    const [fetched] = await broker.fetchOrders();
    expect(fetched.status).toBe(OrderStatus.COMPLETE);
  });

  it("notifies registered order-update handlers on fill", async () => {
    const updates = [];
    broker.onOrderUpdate((update) => updates.push(update));
    await broker.placeOrder(buildOrder());

    priceFeed.emit(6480);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      tag: "grid-CRUDEOIL-entry-1",
      status: OrderStatus.COMPLETE,
      transaction_type: OrderSide.BUY,
      quantity: 100,
      average_price: 6480,
    });
  });

  it("cancels an open order without affecting others", async () => {
    const cancelledId = await broker.placeOrder(buildOrder());
    const otherId = await broker.placeOrder(buildOrder({ idempotencyKey: "grid-CRUDEOIL-entry-2" }));

    await broker.cancelOrder(cancelledId);

    const orders = await broker.fetchOrders();
    const cancelled = orders.find((order) => order.brokerOrderId === cancelledId);
    const other = orders.find((order) => order.brokerOrderId === otherId);
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(other.status).toBe(OrderStatus.OPEN);
  });

  it("forwards raw ticks to subscribers", async () => {
    const received = [];
    broker.subscribeTicks([1], (ticks) => received.push(...ticks));

    priceFeed.emit(6495);

    expect(received).toEqual([{ instrument_token: 1, last_price: 6495 }]);
  });
});
