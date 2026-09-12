import { describe, expect, it, vi } from "vitest";
import { OrderReconciler } from "#state/reconciliation.js";
import { OrderStatus } from "#domain/order.js";

function createFakeRepository(overrides = {}) {
  return {
    findAllOpen: vi.fn(async () => []),
    ...overrides,
  };
}

function createFakeBroker(overrides = {}) {
  return {
    fetchOrders: vi.fn(async () => []),
    placeOrder: vi.fn(async () => "kite-order-new"),
    ...overrides,
  };
}

function createFakeOrderStateManager(overrides = {}) {
  return {
    applyBrokerUpdate: vi.fn(async (idempotencyKey, { status }) => ({ idempotencyKey, status })),
    ...overrides,
  };
}

function createFakeLogger() {
  return { warn: vi.fn(), error: vi.fn() };
}

describe("OrderReconciler", () => {
  it("marks an order already-agreed when local and broker status match", async () => {
    const repository = createFakeRepository({
      findAllOpen: vi.fn(async () => [
        { idempotencyKey: "k1", brokerOrderId: "b1", status: OrderStatus.OPEN },
      ]),
    });
    const broker = createFakeBroker({
      fetchOrders: vi.fn(async () => [
        { idempotencyKey: "k1", brokerOrderId: "b1", status: OrderStatus.OPEN },
      ]),
    });
    const orderStateManager = createFakeOrderStateManager();
    const reconciler = new OrderReconciler({
      broker,
      orderStateManager,
      repository,
      logger: createFakeLogger(),
    });

    const results = await reconciler.reconcile();

    expect(results).toEqual([{ idempotencyKey: "k1", action: "already-agreed" }]);
    expect(orderStateManager.applyBrokerUpdate).not.toHaveBeenCalled();
  });

  it("advances a locally pending order once the broker confirms it", async () => {
    const repository = createFakeRepository({
      findAllOpen: vi.fn(async () => [
        { idempotencyKey: "k1", brokerOrderId: null, status: OrderStatus.PENDING },
      ]),
    });
    const broker = createFakeBroker({
      fetchOrders: vi.fn(async () => [
        { idempotencyKey: "k1", brokerOrderId: "b1", status: OrderStatus.OPEN },
      ]),
    });
    const orderStateManager = createFakeOrderStateManager();
    const reconciler = new OrderReconciler({
      broker,
      orderStateManager,
      repository,
      logger: createFakeLogger(),
    });

    const results = await reconciler.reconcile();

    expect(orderStateManager.applyBrokerUpdate).toHaveBeenCalledWith(
      "k1",
      expect.objectContaining({ brokerOrderId: "b1", status: OrderStatus.OPEN }),
    );
    expect(results).toEqual([{ idempotencyKey: "k1", action: "advanced", status: OrderStatus.OPEN }]);
  });

  it("retries placement for an order the broker never received", async () => {
    const repository = createFakeRepository({
      findAllOpen: vi.fn(async () => [
        { idempotencyKey: "k1", brokerOrderId: null, status: OrderStatus.PENDING, tradingSymbol: "X" },
      ]),
    });
    const broker = createFakeBroker({ fetchOrders: vi.fn(async () => []) });
    const orderStateManager = createFakeOrderStateManager();
    const reconciler = new OrderReconciler({
      broker,
      orderStateManager,
      repository,
      logger: createFakeLogger(),
    });

    const results = await reconciler.reconcile();

    expect(broker.placeOrder).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "k1" }));
    expect(orderStateManager.applyBrokerUpdate).toHaveBeenCalledWith(
      "k1",
      expect.objectContaining({ brokerOrderId: "kite-order-new", status: OrderStatus.OPEN }),
    );
    expect(results).toEqual([{ idempotencyKey: "k1", action: "retried", status: OrderStatus.OPEN }]);
  });

  it("logs and isolates a failure without aborting the rest of the batch", async () => {
    const repository = createFakeRepository({
      findAllOpen: vi.fn(async () => [
        { idempotencyKey: "k1", brokerOrderId: null, status: OrderStatus.PENDING },
        { idempotencyKey: "k2", brokerOrderId: "b2", status: OrderStatus.OPEN },
      ]),
    });
    const broker = createFakeBroker({
      fetchOrders: vi.fn(async () => [
        { idempotencyKey: "k2", brokerOrderId: "b2", status: OrderStatus.OPEN },
      ]),
      placeOrder: vi.fn(async () => {
        throw new Error("still unreachable");
      }),
    });
    const orderStateManager = createFakeOrderStateManager();
    const logger = createFakeLogger();
    const reconciler = new OrderReconciler({ broker, orderStateManager, repository, logger });

    const results = await reconciler.reconcile();

    expect(results).toEqual([
      { idempotencyKey: "k1", action: "failed", error: expect.any(Error) },
      { idempotencyKey: "k2", action: "already-agreed" },
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      "failed to reconcile order",
      expect.objectContaining({ idempotencyKey: "k1" }),
    );
  });
});
