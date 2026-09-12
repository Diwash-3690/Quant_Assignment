import { describe, expect, it } from "vitest";
import { Exchange } from "#domain/instrument.js";
import { createOrder, OrderSide, OrderStatus, OrderType } from "#domain/order.js";

const validInput = {
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

describe("createOrder", () => {
  it("returns a frozen order for valid input", () => {
    const order = createOrder(validInput);
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(Object.isFrozen(order)).toBe(true);
  });

  it("rejects a non-positive quantity", () => {
    expect(() => createOrder({ ...validInput, quantity: 0 })).toThrow();
  });

  it("rejects a non-ISO timestamp", () => {
    expect(() => createOrder({ ...validInput, placedAt: "11-09-2026" })).toThrow();
  });
});
