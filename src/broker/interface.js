export class BrokerInterface {
  async connect() {
    throw new Error("connect() not implemented");
  }

  async disconnect() {
    throw new Error("disconnect() not implemented");
  }

  async placeOrder(order) {
    throw new Error("placeOrder() not implemented");
  }

  async modifyOrder(brokerOrderId, changes) {
    throw new Error("modifyOrder() not implemented");
  }

  async cancelOrder(brokerOrderId) {
    throw new Error("cancelOrder() not implemented");
  }

  async fetchOrders() {
    throw new Error("fetchOrders() not implemented");
  }

  async fetchPositions() {
    throw new Error("fetchPositions() not implemented");
  }

  async fetchMargins() {
    throw new Error("fetchMargins() not implemented");
  }

  subscribeTicks(instrumentTokens, onTick) {
    throw new Error("subscribeTicks() not implemented");
  }

  unsubscribeTicks(instrumentTokens) {
    throw new Error("unsubscribeTicks() not implemented");
  }
}
