import { describe, expect, it } from "vitest";
import { BrokerInterface } from "#broker/interface.js";

describe("BrokerInterface", () => {
  const broker = new BrokerInterface();

  it("rejects on every unimplemented async method", async () => {
    await expect(broker.connect()).rejects.toThrow();
    await expect(broker.disconnect()).rejects.toThrow();
    await expect(broker.placeOrder({})).rejects.toThrow();
    await expect(broker.modifyOrder("1", {})).rejects.toThrow();
    await expect(broker.cancelOrder("1")).rejects.toThrow();
    await expect(broker.fetchOrders()).rejects.toThrow();
    await expect(broker.fetchPositions()).rejects.toThrow();
    await expect(broker.fetchMargins()).rejects.toThrow();
  });

  it("throws on every unimplemented sync method", () => {
    expect(() => broker.subscribeTicks([], () => {})).toThrow();
    expect(() => broker.unsubscribeTicks([])).toThrow();
  });
});
