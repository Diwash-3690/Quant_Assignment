import { describe, expect, it, vi } from "vitest";
import { KiteBroker } from "#broker/kite/broker.js";

function createFakeRestClient() {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    placeOrder: vi.fn(async () => "kite-order-1"),
    modifyOrder: vi.fn(async () => {}),
    cancelOrder: vi.fn(async () => {}),
    fetchOrders: vi.fn(async () => []),
    fetchPositions: vi.fn(async () => []),
    fetchMargins: vi.fn(async () => ({})),
  };
}

function createFakeWsClient() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onTick: vi.fn(),
    onOrderUpdate: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

describe("KiteBroker", () => {
  it("connects both clients", async () => {
    const restClient = createFakeRestClient();
    const wsClient = createFakeWsClient();
    const broker = new KiteBroker({ restClient, wsClient });

    await broker.connect();

    expect(restClient.connect).toHaveBeenCalled();
    expect(wsClient.connect).toHaveBeenCalled();
  });

  it("disconnects both clients", async () => {
    const restClient = createFakeRestClient();
    const wsClient = createFakeWsClient();
    const broker = new KiteBroker({ restClient, wsClient });

    await broker.disconnect();

    expect(restClient.disconnect).toHaveBeenCalled();
    expect(wsClient.disconnect).toHaveBeenCalled();
  });

  it("delegates order operations to the REST client", async () => {
    const restClient = createFakeRestClient();
    const wsClient = createFakeWsClient();
    const broker = new KiteBroker({ restClient, wsClient });
    const order = { idempotencyKey: "grid-01-leg-01" };

    const brokerOrderId = await broker.placeOrder(order);
    expect(brokerOrderId).toBe("kite-order-1");
    expect(restClient.placeOrder).toHaveBeenCalledWith(order);

    await broker.modifyOrder("kite-order-1", { price: 100 });
    expect(restClient.modifyOrder).toHaveBeenCalledWith("kite-order-1", { price: 100 });

    await broker.cancelOrder("kite-order-1");
    expect(restClient.cancelOrder).toHaveBeenCalledWith("kite-order-1");

    await broker.fetchOrders();
    expect(restClient.fetchOrders).toHaveBeenCalled();

    await broker.fetchPositions();
    expect(restClient.fetchPositions).toHaveBeenCalled();

    await broker.fetchMargins();
    expect(restClient.fetchMargins).toHaveBeenCalled();
  });

  it("delegates tick subscription to the WS client", () => {
    const restClient = createFakeRestClient();
    const wsClient = createFakeWsClient();
    const broker = new KiteBroker({ restClient, wsClient });
    const onTick = vi.fn();

    broker.subscribeTicks([101, 102], onTick);
    expect(wsClient.onTick).toHaveBeenCalledWith(onTick);
    expect(wsClient.subscribe).toHaveBeenCalledWith([101, 102]);

    broker.unsubscribeTicks([101, 102]);
    expect(wsClient.unsubscribe).toHaveBeenCalledWith([101, 102]);
  });

  it("delegates order update subscription to the WS client", () => {
    const restClient = createFakeRestClient();
    const wsClient = createFakeWsClient();
    const broker = new KiteBroker({ restClient, wsClient });
    const onOrderUpdate = vi.fn();

    broker.onOrderUpdate(onOrderUpdate);
    expect(wsClient.onOrderUpdate).toHaveBeenCalledWith(onOrderUpdate);
  });
});
