import { BrokerInterface } from "#broker/interface.js";
import { OrderStatus } from "#domain/order.js";
import { computeTransactionCost } from "#backtest/costs.js";
import { simulateFill } from "#backtest/fills.js";

export class SimulatedBroker extends BrokerInterface {
  constructor({ costConfig }) {
    super();
    this.costConfig = costConfig;
    this.pendingOrders = new Map();
    this.filledOrders = [];
    this.currentBar = null;
    this.nextOrderId = 1;
  }

  setCurrentBar(bar) {
    this.currentBar = bar;
  }

  async connect() {}

  async disconnect() {}

  async placeOrder(order) {
    const brokerOrderId = `sim-${this.nextOrderId}`;
    this.nextOrderId += 1;
    this.pendingOrders.set(brokerOrderId, { ...order, brokerOrderId });
    return brokerOrderId;
  }

  async cancelOrder(brokerOrderId) {
    this.pendingOrders.delete(brokerOrderId);
  }

  async fetchOrders() {
    return [...this.filledOrders];
  }

  evaluatePendingOrders() {
    const fills = [];
    for (const [brokerOrderId, order] of this.pendingOrders) {
      const result = simulateFill(order, this.currentBar);
      if (!result.filled) {
        continue;
      }

      const turnover = result.price * order.quantity;
      const cost = computeTransactionCost(turnover, this.costConfig);
      fills.push({ brokerOrderId, order, price: result.price, cost });

      this.pendingOrders.delete(brokerOrderId);
      this.filledOrders.push({
        ...order,
        brokerOrderId,
        status: OrderStatus.COMPLETE,
        idempotencyKey: order.idempotencyKey,
      });
    }
    return fills;
  }
}

export class BacktestRunner {
  constructor({ broker, bars }) {
    this.broker = broker;
    this.bars = bars;
  }

  async run(onBar) {
    const history = [];
    for (const bar of this.bars) {
      this.broker.setCurrentBar(bar);
      const fills = this.broker.evaluatePendingOrders();
      const record = { bar, fills };
      history.push(record);
      await onBar(bar, fills, history);
    }
    return history;
  }
}
