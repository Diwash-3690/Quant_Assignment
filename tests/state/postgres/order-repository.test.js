import { describe, expect, it, vi } from "vitest";
import { PostgresOrderRepository } from "#state/postgres/order-repository.js";
import { Exchange } from "#domain/instrument.js";
import { OrderSide, OrderStatus, OrderType } from "#domain/order.js";

function createFakePool(queryResult = { rows: [] }) {
  return {
    query: vi.fn(async () => queryResult),
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

const sampleRow = {
  idempotency_key: "grid-01-leg-01",
  broker_order_id: "kite-order-1",
  trading_symbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  side: OrderSide.BUY,
  order_type: OrderType.LIMIT,
  quantity: 100,
  price: "6250.50",
  trigger_price: null,
  status: OrderStatus.OPEN,
  placed_at: "2026-09-11T09:15:00.000Z",
  updated_at: "2026-09-11T09:15:00.000Z",
};

describe("PostgresOrderRepository", () => {
  it("inserts with an idempotent conflict clause on save", async () => {
    const pool = createFakePool();
    const repository = new PostgresOrderRepository({ pool });

    await repository.save(sampleOrder);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (idempotency_key) DO NOTHING"),
      expect.arrayContaining(["grid-01-leg-01", null, "CRUDEOIL25DECFUT"]),
    );
  });

  it("maps a found row back to the domain shape", async () => {
    const pool = createFakePool({ rows: [sampleRow] });
    const repository = new PostgresOrderRepository({ pool });

    const order = await repository.findByIdempotencyKey("grid-01-leg-01");

    expect(order).toEqual({
      idempotencyKey: "grid-01-leg-01",
      brokerOrderId: "kite-order-1",
      tradingSymbol: "CRUDEOIL25DECFUT",
      exchange: Exchange.MCX,
      side: OrderSide.BUY,
      orderType: OrderType.LIMIT,
      quantity: 100,
      price: 6250.5,
      triggerPrice: null,
      status: OrderStatus.OPEN,
      placedAt: "2026-09-11T09:15:00.000Z",
      updatedAt: "2026-09-11T09:15:00.000Z",
    });
  });

  it("returns null when nothing matches", async () => {
    const pool = createFakePool({ rows: [] });
    const repository = new PostgresOrderRepository({ pool });

    expect(await repository.findByBrokerOrderId("missing")).toBeNull();
  });

  it("passes broker order id and status through on update", async () => {
    const pool = createFakePool();
    const repository = new PostgresOrderRepository({ pool });

    await repository.update("grid-01-leg-01", {
      brokerOrderId: "kite-order-1",
      status: OrderStatus.OPEN,
      updatedAt: "2026-09-11T09:16:00.000Z",
    });

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE orders SET"), [
      "grid-01-leg-01",
      "kite-order-1",
      OrderStatus.OPEN,
      "2026-09-11T09:16:00.000Z",
    ]);
  });

  it("filters open orders to pending and open statuses", async () => {
    const pool = createFakePool({ rows: [] });
    const repository = new PostgresOrderRepository({ pool });

    await repository.findAllOpen();

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
      [OrderStatus.PENDING, OrderStatus.OPEN],
    ]);
  });
});
