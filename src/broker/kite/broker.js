import { BrokerInterface } from "#broker/interface.js";

export class KiteBroker extends BrokerInterface {
  constructor({ restClient, wsClient }) {
    super();
    this.restClient = restClient;
    this.wsClient = wsClient;
  }

  async connect() {
    await this.restClient.connect();
    this.wsClient.connect();
  }

  async disconnect() {
    await this.restClient.disconnect();
    this.wsClient.disconnect();
  }

  placeOrder(order) {
    return this.restClient.placeOrder(order);
  }

  modifyOrder(brokerOrderId, changes) {
    return this.restClient.modifyOrder(brokerOrderId, changes);
  }

  cancelOrder(brokerOrderId) {
    return this.restClient.cancelOrder(brokerOrderId);
  }

  fetchOrders() {
    return this.restClient.fetchOrders();
  }

  fetchPositions() {
    return this.restClient.fetchPositions();
  }

  fetchMargins() {
    return this.restClient.fetchMargins();
  }

  subscribeTicks(instrumentTokens, onTick) {
    this.wsClient.onTick(onTick);
    this.wsClient.subscribe(instrumentTokens);
  }

  unsubscribeTicks(instrumentTokens) {
    this.wsClient.unsubscribe(instrumentTokens);
  }

  onOrderUpdate(handler) {
    this.wsClient.onOrderUpdate(handler);
  }
}
