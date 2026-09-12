import { describe, expect, it, vi } from "vitest";
import { assertValidOrderTransition, OrderStateManager } from "#state/order-state.js";
import { Exchange } from "#domain/instrument.js";
import { OrderSide, OrderStatus, OrderType } from "#domain/order.js";

function createFakeRepository(overrides = {}) {
  return {
    findByIdempotencyKey: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    ...overrides,
  };
}

function createFakeBroker(overrides = {}) {
  return {
    placeOrder: vi.fn(async () => "kite-order-1"),
    ...overrides,
  };
}

const orderInput = {
  idempotencyKey: "grid-01-leg-01",
  tradingSymbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  side: OrderSide.BUY,
  orderType: OrderType.LIMIT,
  quantity: 100,
  price: 6250.5,
  triggerPrice: null,
};

describe("assertValidOrderTransition", () => {
  it("allows a documented transition", () => {
    expect(() => assertValidOrderTransition(OrderStatus.OPEN, OrderStatus.COMPLETE)).not.toThrow();
  });

  it("rejects a transition out of a terminal state", () => {
    expect(() => assertValidOrderTransition(OrderStatus.COMPLETE, OrderStatus.OPEN)).toThrow();
  });
});

describe("OrderStateManager.placeOrder", () => {
  it("returns the existing record instead of re-placing when already known", async () => {
    const existing = { idempotencyKey: "grid-01-leg-01", status: OrderStatus.OPEN };
    const repository = createFakeRepository({
      findByIdempotencyKey: vi.fn(async () => existing),
    });
    const broker = createFakeBroker();
    const manager = new OrderStateManager({ broker, repository, clock: () => "2026-09-11T09:15:00.000Z" });

    const result = await manager.placeOrder(orderInput);

    expect(result).toBe(existing);
    expect(broker.placeOrder).not.toHaveBeenCalled();
  });

  it("persists intent as PENDING before calling the broker", async () => {
    const repository = createFakeRepository();
    const broker = createFakeBroker();
    const manager = new OrderStateManager({ broker, repository, clock: () => "2026-09-11T09:15:00.000Z" });

    const callOrder = [];
    repository.save.mockImplementation(async () => {
      callOrder.push("save");
    });
    broker.placeOrder.mockImplementation(async () => {
      callOrder.push("placeOrder");
      return "kite-order-1";
    });

    await manager.placeOrder(orderInput);

    expect(callOrder).toEqual(["save", "placeOrder"]);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.PENDING, brokerOrderId: null }),
    );
  });

  it("promotes the order to OPEN with the broker order id on success", async () => {
    const repository = createFakeRepository();
    const broker = createFakeBroker();
    const manager = new OrderStateManager({ broker, repository, clock: () => "2026-09-11T09:15:00.000Z" });

    const result = await manager.placeOrder(orderInput);

    expect(repository.update).toHaveBeenCalledWith("grid-01-leg-01", {
      brokerOrderId: "kite-order-1",
      status: OrderStatus.OPEN,
      updatedAt: "2026-09-11T09:15:00.000Z",
    });
    expect(result.status).toBe(OrderStatus.OPEN);
    expect(result.brokerOrderId).toBe("kite-order-1");
  });

  it("leaves the record at PENDING and propagates the error when placement fails", async () => {
    const repository = createFakeRepository();
    const broker = createFakeBroker({
      placeOrder: vi.fn(async () => {
        throw new Error("network blip");
      }),
    });
    const manager = new OrderStateManager({ broker, repository, clock: () => "2026-09-11T09:15:00.000Z" });

    await expect(manager.placeOrder(orderInput)).rejects.toThrow("network blip");

    expect(repository.save).toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe("OrderStateManager.applyBrokerUpdate", () => {
  it("applies a valid transition and carries the existing brokerOrderId forward", async () => {
    const existing = {
      idempotencyKey: "grid-01-leg-01",
      brokerOrderId: "kite-order-1",
      status: OrderStatus.OPEN,
    };
    const repository = createFakeRepository({
      findByIdempotencyKey: vi.fn(async () => existing),
    });
    const manager = new OrderStateManager({ broker: createFakeBroker(), repository });

    const result = await manager.applyBrokerUpdate("grid-01-leg-01", {
      status: OrderStatus.COMPLETE,
      updatedAt: "2026-09-11T09:20:00.000Z",
    });

    expect(repository.update).toHaveBeenCalledWith("grid-01-leg-01", {
      brokerOrderId: "kite-order-1",
      status: OrderStatus.COMPLETE,
      updatedAt: "2026-09-11T09:20:00.000Z",
    });
    expect(result.status).toBe(OrderStatus.COMPLETE);
  });

  it("backfills a missing brokerOrderId when reconciliation discovers one", async () => {
    const existing = {
      idempotencyKey: "grid-01-leg-01",
      brokerOrderId: null,
      status: OrderStatus.PENDING,
    };
    const repository = createFakeRepository({
      findByIdempotencyKey: vi.fn(async () => existing),
    });
    const manager = new OrderStateManager({ broker: createFakeBroker(), repository });

    await manager.applyBrokerUpdate("grid-01-leg-01", {
      brokerOrderId: "kite-order-2",
      status: OrderStatus.OPEN,
      updatedAt: "2026-09-11T09:20:00.000Z",
    });

    expect(repository.update).toHaveBeenCalledWith("grid-01-leg-01", {
      brokerOrderId: "kite-order-2",
      status: OrderStatus.OPEN,
      updatedAt: "2026-09-11T09:20:00.000Z",
    });
  });

  it("rejects an illegal transition without touching the repository", async () => {
    const existing = { idempotencyKey: "grid-01-leg-01", status: OrderStatus.COMPLETE };
    const repository = createFakeRepository({
      findByIdempotencyKey: vi.fn(async () => existing),
    });
    const manager = new OrderStateManager({ broker: createFakeBroker(), repository });

    await expect(
      manager.applyBrokerUpdate("grid-01-leg-01", {
        status: OrderStatus.OPEN,
        updatedAt: "2026-09-11T09:20:00.000Z",
      }),
    ).rejects.toThrow("illegal order state transition");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("rejects an update for an order it has no local record of", async () => {
    const repository = createFakeRepository();
    const manager = new OrderStateManager({ broker: createFakeBroker(), repository });

    await expect(
      manager.applyBrokerUpdate("unknown-key", {
        status: OrderStatus.OPEN,
        updatedAt: "2026-09-11T09:20:00.000Z",
      }),
    ).rejects.toThrow("no local order found");
  });
});

describe("OrderStateManager.cancelOrder", () => {
  it("cancels at the broker and marks the local record cancelled", async () => {
    const existing = {
      idempotencyKey: "grid-01-leg-01",
      brokerOrderId: "kite-order-1",
      status: OrderStatus.OPEN,
    };
    const repository = createFakeRepository({
      findByIdempotencyKey: vi.fn(async () => existing),
    });
    const broker = createFakeBroker({ cancelOrder: vi.fn(async () => {}) });
    const manager = new OrderStateManager({
      broker,
      repository,
      clock: () => "2026-09-11T09:20:00.000Z",
    });

    const result = await manager.cancelOrder("grid-01-leg-01");

    expect(broker.cancelOrder).toHaveBeenCalledWith("kite-order-1");
    expect(repository.update).toHaveBeenCalledWith("grid-01-leg-01", {
      status: OrderStatus.CANCELLED,
      updatedAt: "2026-09-11T09:20:00.000Z",
    });
    expect(result.status).toBe(OrderStatus.CANCELLED);
  });

  it("skips the broker call when the order never received a brokerOrderId", async () => {
    const existing = {
      idempotencyKey: "grid-01-leg-01",
      brokerOrderId: null,
      status: OrderStatus.PENDING,
    };
    const repository = createFakeRepository({
      findByIdempotencyKey: vi.fn(async () => existing),
    });
    const broker = createFakeBroker({ cancelOrder: vi.fn(async () => {}) });
    const manager = new OrderStateManager({ broker, repository });

    const result = await manager.cancelOrder("grid-01-leg-01");

    expect(broker.cancelOrder).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it("rejects cancelling an order with no local record", async () => {
    const repository = createFakeRepository();
    const manager = new OrderStateManager({ broker: createFakeBroker(), repository });

    await expect(manager.cancelOrder("unknown-key")).rejects.toThrow("no local order found");
  });
});
