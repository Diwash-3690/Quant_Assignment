import { OrderStatus } from "#domain/order.js";

export class OrderReconciler {
  constructor({ broker, orderStateManager, repository, logger = console }) {
    this.broker = broker;
    this.orderStateManager = orderStateManager;
    this.repository = repository;
    this.logger = logger;
  }

  async reconcile() {
    const [localOpenOrders, brokerOrders] = await Promise.all([
      this.repository.findAllOpen(),
      this.broker.fetchOrders(),
    ]);

    const brokerOrdersByKey = new Map(
      brokerOrders
        .filter((order) => order.idempotencyKey)
        .map((order) => [order.idempotencyKey, order]),
    );

    const results = [];
    for (const localOrder of localOpenOrders) {
      try {
        const brokerOrder = brokerOrdersByKey.get(localOrder.idempotencyKey);
        const result = brokerOrder
          ? await this.reconcileFound(localOrder, brokerOrder)
          : await this.reconcileMissing(localOrder);
        results.push(result);
      } catch (error) {
        this.logger.error("failed to reconcile order", {
          idempotencyKey: localOrder.idempotencyKey,
          error,
        });
        results.push({ idempotencyKey: localOrder.idempotencyKey, action: "failed", error });
      }
    }
    return results;
  }

  async reconcileFound(localOrder, brokerOrder) {
    if (localOrder.status === brokerOrder.status) {
      return { idempotencyKey: localOrder.idempotencyKey, action: "already-agreed" };
    }

    const updated = await this.orderStateManager.applyBrokerUpdate(localOrder.idempotencyKey, {
      brokerOrderId: brokerOrder.brokerOrderId,
      status: brokerOrder.status,
      updatedAt: new Date().toISOString(),
    });
    return { idempotencyKey: localOrder.idempotencyKey, action: "advanced", status: updated.status };
  }

  async reconcileMissing(localOrder) {
    this.logger.warn("order never reached the broker, retrying placement", {
      idempotencyKey: localOrder.idempotencyKey,
    });
    const brokerOrderId = await this.broker.placeOrder(localOrder);
    const updated = await this.orderStateManager.applyBrokerUpdate(localOrder.idempotencyKey, {
      brokerOrderId,
      status: OrderStatus.OPEN,
      updatedAt: new Date().toISOString(),
    });
    return { idempotencyKey: localOrder.idempotencyKey, action: "retried", status: updated.status };
  }
}
