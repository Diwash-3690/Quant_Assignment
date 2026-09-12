import { describe, expect, it, vi } from "vitest";
import { KiteRestClient } from "#broker/kite/rest-client.js";
import { Exchange } from "#domain/instrument.js";
import { OrderSide, OrderStatus, OrderType } from "#domain/order.js";

function createFakeKite(overrides = {}) {
  return {
    setAccessToken: vi.fn(),
    placeOrder: vi.fn(async () => ({ order_id: "kite-order-1" })),
    modifyOrder: vi.fn(async () => ({ order_id: "kite-order-1" })),
    cancelOrder: vi.fn(async () => ({ order_id: "kite-order-1" })),
    getOrders: vi.fn(async () => []),
    getPositions: vi.fn(async () => ({ net: [] })),
    getMargins: vi.fn(async () => ({})),
    ...overrides,
  };
}

const sampleOrder = {
  idempotencyKey: "grid-01-leg-01",
  brokerOrderId: null,
  tradingSymbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  side: OrderSide.BUY,
  orderType: OrderType.LIMIT,
  quantity: 100,
  price: 6250.5,
  triggerPrice: null,
  status: OrderStatus.PENDING,
  placedAt: "2026-09-11T09:15:00.000Z",
  updatedAt: "2026-09-11T09:15:00.000Z",
};

describe("KiteRestClient", () => {
  it("sets the access token on connect", async () => {
    const kite = createFakeKite();
    const client = new KiteRestClient({ kite, accessToken: "token-123" });
    await client.connect();
    expect(kite.setAccessToken).toHaveBeenCalledWith("token-123");
  });

  it("places an order exactly once, with no automatic retry", async () => {
    const kite = createFakeKite({
      placeOrder: vi.fn(async () => {
        throw new Error("network blip");
      }),
    });
    const client = new KiteRestClient({ kite, accessToken: "token-123" });

    await expect(client.placeOrder(sampleOrder)).rejects.toThrow("network blip");
    expect(kite.placeOrder).toHaveBeenCalledTimes(1);
  });

  it("maps the domain order to Kite's expected params", async () => {
    const kite = createFakeKite();
    const client = new KiteRestClient({ kite, accessToken: "token-123" });

    const brokerOrderId = await client.placeOrder(sampleOrder);

    expect(brokerOrderId).toBe("kite-order-1");
    expect(kite.placeOrder).toHaveBeenCalledWith(
      "regular",
      expect.objectContaining({
        exchange: Exchange.MCX,
        tradingsymbol: "CRUDEOIL25DECFUT",
        transaction_type: OrderSide.BUY,
        order_type: OrderType.LIMIT,
        quantity: 100,
        price: 6250.5,
      }),
    );
  });

  it("retries cancelOrder on transient failure", async () => {
    let attempts = 0;
    const kite = createFakeKite({
      cancelOrder: vi.fn(async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error("transient");
        }
        return { order_id: "kite-order-1" };
      }),
    });
    const client = new KiteRestClient({
      kite,
      accessToken: "token-123",
      retryOptions: { retries: 2, minTimeoutMs: 1 },
    });

    const result = await client.cancelOrder("kite-order-1");
    expect(result.order_id).toBe("kite-order-1");
    expect(attempts).toBe(2);
  });

  it("maps fetched orders to the domain shape", async () => {
    const kite = createFakeKite({
      getOrders: vi.fn(async () => [
        {
          order_id: "kite-order-1",
          tag: "grid-01-leg-01",
          tradingsymbol: "CRUDEOIL25DECFUT",
          exchange: Exchange.MCX,
          status: "COMPLETE",
          quantity: 100,
          price: 6250.5,
        },
      ]),
    });
    const client = new KiteRestClient({ kite, accessToken: "token-123" });

    const [order] = await client.fetchOrders();
    expect(order).toEqual({
      brokerOrderId: "kite-order-1",
      idempotencyKey: "grid-01-leg-01",
      tradingSymbol: "CRUDEOIL25DECFUT",
      exchange: Exchange.MCX,
      status: OrderStatus.COMPLETE,
      quantity: 100,
      price: 6250.5,
    });
  });
});
