import { createOrder, OrderStatus } from "#domain/order.js";

export const ORDER_TRANSITIONS = Object.freeze({
  [OrderStatus.PENDING]: [
    OrderStatus.OPEN,
    OrderStatus.COMPLETE,
    OrderStatus.CANCELLED,
    OrderStatus.REJECTED,
  ],
  [OrderStatus.OPEN]: [OrderStatus.COMPLETE, OrderStatus.CANCELLED, OrderStatus.REJECTED],
  [OrderStatus.COMPLETE]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REJECTED]: [],
});

export function assertValidOrderTransition(fromStatus, toStatus) {
  if (!ORDER_TRANSITIONS[fromStatus]?.includes(toStatus)) {
    throw new Error(`illegal order state transition: ${fromStatus} -> ${toStatus}`);
  }
}

export class OrderStateManager {
  constructor({ broker, repository, clock = () => new Date().toISOString() }) {
    this.broker = broker;
    this.repository = repository;
    this.clock = clock;
  }

  async placeOrder(orderInput) {
    const existing = await this.repository.findByIdempotencyKey(orderInput.idempotencyKey);
    if (existing) {
      return existing;
    }

    const placedAt = this.clock();
    const intent = createOrder({
      ...orderInput,
      brokerOrderId: null,
      status: OrderStatus.PENDING,
      placedAt,
      updatedAt: placedAt,
    });
    await this.repository.save(intent);

    const brokerOrderId = await this.broker.placeOrder(intent);

    const updatedAt = this.clock();
    await this.repository.update(intent.idempotencyKey, {
      brokerOrderId,
      status: OrderStatus.OPEN,
      updatedAt,
    });

    return { ...intent, brokerOrderId, status: OrderStatus.OPEN, updatedAt };
  }

  async applyBrokerUpdate(idempotencyKey, { brokerOrderId, status, updatedAt }) {
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (!existing) {
      throw new Error(`no local order found for idempotency key: ${idempotencyKey}`);
    }

    assertValidOrderTransition(existing.status, status);
    const resolvedBrokerOrderId = brokerOrderId ?? existing.brokerOrderId;
    await this.repository.update(idempotencyKey, {
      brokerOrderId: resolvedBrokerOrderId,
      status,
      updatedAt,
    });
    return { ...existing, brokerOrderId: resolvedBrokerOrderId, status, updatedAt };
  }

  async cancelOrder(idempotencyKey) {
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (!existing) {
      throw new Error(`no local order found for idempotency key: ${idempotencyKey}`);
    }
    if (!existing.brokerOrderId) {
      return existing;
    }

    await this.broker.cancelOrder(existing.brokerOrderId);
    const updatedAt = this.clock();
    assertValidOrderTransition(existing.status, OrderStatus.CANCELLED);
    await this.repository.update(idempotencyKey, { status: OrderStatus.CANCELLED, updatedAt });
    return { ...existing, status: OrderStatus.CANCELLED, updatedAt };
  }
}
