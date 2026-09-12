import { BrokerInterface } from "#broker/interface.js";
import { OrderSide, OrderStatus, OrderType } from "#domain/order.js";
import { roundToTick } from "#domain/money.js";

let brokerOrderSequence = 0;

function nextBrokerOrderId() {
  brokerOrderSequence += 1;
  return `mock-${brokerOrderSequence}`;
}

function fillsLimitOrder(record, lastPrice) {
  if (record.orderType !== OrderType.LIMIT) {
    return false;
  }
  return record.side === OrderSide.BUY ? lastPrice <= record.price : lastPrice >= record.price;
}

export class MockBroker extends BrokerInterface {
  constructor({ priceFeed, tickSize, logger = console }) {
    super();
    this.priceFeed = priceFeed;
    this.tickSize = tickSize;
    this.logger = logger;
    this.orders = new Map();
    this.orderUpdateHandlers = new Set();
    this.tickHandlers = new Set();
    this.unsubscribeFromFeed = null;
  }

  async connect() {
    this.unsubscribeFromFeed = this.priceFeed.onTick((tick) => this.handleTick(tick));
  }

  async disconnect() {
    this.unsubscribeFromFeed?.();
    this.unsubscribeFromFeed = null;
    this.priceFeed.stop();
  }

  async placeOrder(order) {
    const brokerOrderId = nextBrokerOrderId();
    const record = {
      brokerOrderId,
      idempotencyKey: order.idempotencyKey,
      tradingSymbol: order.tradingSymbol,
      exchange: order.exchange,
      side: order.side,
      orderType: order.orderType,
      quantity: order.quantity,
      price: order.price,
      status: OrderStatus.OPEN,
    };
    this.orders.set(brokerOrderId, record);

    if (order.orderType === OrderType.MARKET) {
      this.fillOrder(record, this.priceFeed.lastPrice);
    }

    return brokerOrderId;
  }

  async modifyOrder(brokerOrderId, changes) {
    const record = this.orders.get(brokerOrderId);
    if (!record) {
      throw new Error(`unknown mock broker order: ${brokerOrderId}`);
    }
    Object.assign(record, changes);
    return { ...record };
  }

  async cancelOrder(brokerOrderId) {
    const record = this.orders.get(brokerOrderId);
    if (!record) {
      throw new Error(`unknown mock broker order: ${brokerOrderId}`);
    }
    if (record.status === OrderStatus.OPEN) {
      record.status = OrderStatus.CANCELLED;
    }
    return { ...record };
  }

  async fetchOrders() {
    return Array.from(this.orders.values(), (record) => ({ ...record }));
  }

  async fetchPositions() {
    return [];
  }

  async fetchMargins() {
    return { equity: { available: { cash: 10_000_000 }, utilised: { debits: 0 } } };
  }

  subscribeTicks(instrumentTokens, onTick) {
    this.tickHandlers.add(onTick);
  }

  unsubscribeTicks() {
    this.tickHandlers.clear();
  }

  onOrderUpdate(handler) {
    this.orderUpdateHandlers.add(handler);
  }

  handleTick(tick) {
    for (const handler of this.tickHandlers) {
      handler([tick]);
    }

    for (const record of this.orders.values()) {
      if (record.status === OrderStatus.OPEN && fillsLimitOrder(record, tick.last_price)) {
        this.fillOrder(record, record.price);
      }
    }
  }

  fillOrder(record, fillPrice) {
    record.status = OrderStatus.COMPLETE;
    const averagePrice = roundToTick(fillPrice, this.tickSize);
    for (const handler of this.orderUpdateHandlers) {
      handler({
        tag: record.idempotencyKey,
        status: OrderStatus.COMPLETE,
        transaction_type: record.side,
        quantity: record.quantity,
        average_price: averagePrice,
      });
    }
  }
}
