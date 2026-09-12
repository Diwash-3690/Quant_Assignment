import { BrokerInterface } from "#broker/interface.js";
import { createRateLimiter, withRetry, withTimeout } from "#broker/resilience.js";
import { OrderStatus } from "#domain/order.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ORDER_CALLS_PER_SECOND = 3;

const KITE_STATUS_TO_DOMAIN = Object.freeze({
  OPEN: OrderStatus.OPEN,
  COMPLETE: OrderStatus.COMPLETE,
  CANCELLED: OrderStatus.CANCELLED,
  REJECTED: OrderStatus.REJECTED,
});

function toDomainOrderStatus(kiteStatus) {
  return KITE_STATUS_TO_DOMAIN[kiteStatus] ?? OrderStatus.PENDING;
}

function toKiteOrderParams(order) {
  return {
    exchange: order.exchange,
    tradingsymbol: order.tradingSymbol,
    transaction_type: order.side,
    order_type: order.orderType,
    quantity: order.quantity,
    price: order.price ?? undefined,
    trigger_price: order.triggerPrice ?? undefined,
    tag: order.idempotencyKey.slice(0, 20),
  };
}

export class KiteRestClient extends BrokerInterface {
  constructor({
    kite,
    accessToken,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    ordersPerSecond = DEFAULT_ORDER_CALLS_PER_SECOND,
    retryOptions = {},
  }) {
    super();
    this.kite = kite;
    this.accessToken = accessToken;
    this.timeoutMs = timeoutMs;
    this.retryOptions = retryOptions;
    this.rateLimitOrderCall = createRateLimiter(ordersPerSecond);
  }

  async connect() {
    this.kite.setAccessToken(this.accessToken);
  }

  async disconnect() {
    this.accessToken = null;
  }

  async placeOrder(order) {
    const params = toKiteOrderParams(order);
    const response = await this.rateLimitOrderCall(() =>
      withTimeout(() => this.kite.placeOrder("regular", params), this.timeoutMs),
    );
    return response.order_id;
  }

  async modifyOrder(brokerOrderId, changes) {
    return this.rateLimitOrderCall(() =>
      withRetry(
        () => withTimeout(() => this.kite.modifyOrder("regular", brokerOrderId, changes), this.timeoutMs),
        this.retryOptions,
      ),
    );
  }

  async cancelOrder(brokerOrderId) {
    return this.rateLimitOrderCall(() =>
      withRetry(
        () => withTimeout(() => this.kite.cancelOrder("regular", brokerOrderId), this.timeoutMs),
        this.retryOptions,
      ),
    );
  }

  async fetchOrders() {
    const orders = await withRetry(
      () => withTimeout(() => this.kite.getOrders(), this.timeoutMs),
      this.retryOptions,
    );
    return orders.map((order) => ({
      brokerOrderId: order.order_id,
      idempotencyKey: order.tag,
      tradingSymbol: order.tradingsymbol,
      exchange: order.exchange,
      status: toDomainOrderStatus(order.status),
      quantity: order.quantity,
      price: order.price,
    }));
  }

  async fetchPositions() {
    const positions = await withRetry(
      () => withTimeout(() => this.kite.getPositions(), this.timeoutMs),
      this.retryOptions,
    );
    return positions.net.map((position) => ({
      tradingSymbol: position.tradingsymbol,
      exchange: position.exchange,
      netQuantity: position.quantity,
      averagePrice: position.average_price,
      realizedPnl: position.realised,
      unrealizedPnl: position.unrealised,
    }));
  }

  async fetchMargins() {
    return withRetry(
      () => withTimeout(() => this.kite.getMargins(), this.timeoutMs),
      this.retryOptions,
    );
  }
}
