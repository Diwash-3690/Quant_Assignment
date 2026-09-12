import { describe, expect, it, vi } from "vitest";
import { applyFill, markToMarket, PositionStateManager } from "#state/position-state.js";
import { OrderSide } from "#domain/order.js";

const flat = {
  tradingSymbol: "CRUDEOIL25DECFUT",
  exchange: "MCX",
  netQuantity: 0,
  averagePrice: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  updatedAt: "2026-09-11T09:00:00.000Z",
};

describe("applyFill", () => {
  it("opens a long position from flat", () => {
    const result = applyFill(flat, {
      side: OrderSide.BUY,
      quantity: 100,
      price: 6250.5,
      filledAt: "2026-09-11T09:15:00.000Z",
    });

    expect(result.netQuantity).toBe(100);
    expect(result.averagePrice).toBe(6250.5);
    expect(result.realizedPnl).toBe(0);
  });

  it("re-averages when adding to an existing long position", () => {
    const longPosition = { ...flat, netQuantity: 100, averagePrice: 6250.5 };

    const result = applyFill(longPosition, {
      side: OrderSide.BUY,
      quantity: 50,
      price: 6300,
      filledAt: "2026-09-11T09:20:00.000Z",
    });

    expect(result.netQuantity).toBe(150);
    expect(result.averagePrice).toBe(6267);
    expect(result.realizedPnl).toBe(0);
  });

  it("realizes P&L on a partial close without moving the average price", () => {
    const longPosition = { ...flat, netQuantity: 150, averagePrice: 6267 };

    const result = applyFill(longPosition, {
      side: OrderSide.SELL,
      quantity: 60,
      price: 6300,
      filledAt: "2026-09-11T09:25:00.000Z",
    });

    expect(result.netQuantity).toBe(90);
    expect(result.averagePrice).toBe(6267);
    expect(result.realizedPnl).toBe(1980);
  });

  it("fully closes a position and resets the average price to zero", () => {
    const longPosition = { ...flat, netQuantity: 90, averagePrice: 6267, realizedPnl: 1980 };

    const result = applyFill(longPosition, {
      side: OrderSide.SELL,
      quantity: 90,
      price: 6280,
      filledAt: "2026-09-11T09:30:00.000Z",
    });

    expect(result.netQuantity).toBe(0);
    expect(result.averagePrice).toBe(0);
    expect(result.realizedPnl).toBe(3150);
  });

  it("reverses direction, realizing P&L on the close and opening the new side at the fill price", () => {
    const longPosition = { ...flat, netQuantity: 100, averagePrice: 6250.5 };

    const result = applyFill(longPosition, {
      side: OrderSide.SELL,
      quantity: 150,
      price: 6300,
      filledAt: "2026-09-11T09:35:00.000Z",
    });

    expect(result.netQuantity).toBe(-50);
    expect(result.averagePrice).toBe(6300);
    expect(result.realizedPnl).toBe(4950);
  });

  it("re-averages when adding to an existing short position", () => {
    const shortPosition = { ...flat, netQuantity: -50, averagePrice: 6300 };

    const result = applyFill(shortPosition, {
      side: OrderSide.SELL,
      quantity: 50,
      price: 6260,
      filledAt: "2026-09-11T09:40:00.000Z",
    });

    expect(result.netQuantity).toBe(-100);
    expect(result.averagePrice).toBe(6280);
  });

  it("returns a frozen, schema-validated position, same as createPosition would", () => {
    const result = applyFill(flat, {
      side: OrderSide.BUY,
      quantity: 100,
      price: 6250.5,
      filledAt: "2026-09-11T09:15:00.000Z",
    });

    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects a fill that would produce an invalid position", () => {
    const positionWithBadExchange = { ...flat, exchange: "NOT_A_REAL_EXCHANGE" };

    expect(() =>
      applyFill(positionWithBadExchange, {
        side: OrderSide.BUY,
        quantity: 100,
        price: 6250.5,
        filledAt: "2026-09-11T09:15:00.000Z",
      }),
    ).toThrow();
  });
});

describe("markToMarket", () => {
  it("computes unrealized P&L for a long position", () => {
    const longPosition = { ...flat, netQuantity: 100, averagePrice: 6250.5 };

    const result = markToMarket(longPosition, 6300, "2026-09-11T09:45:00.000Z");

    expect(result.unrealizedPnl).toBe(4950);
    expect(result.updatedAt).toBe("2026-09-11T09:45:00.000Z");
  });

  it("computes unrealized P&L for a short position", () => {
    const shortPosition = { ...flat, netQuantity: -50, averagePrice: 6300 };

    const result = markToMarket(shortPosition, 6260, "2026-09-11T09:45:00.000Z");

    expect(result.unrealizedPnl).toBe(2000);
  });

  it("returns a frozen, schema-validated position", () => {
    const result = markToMarket(flat, 6300, "2026-09-11T09:45:00.000Z");
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("PositionStateManager", () => {
  function createFakeRepository(overrides = {}) {
    return {
      find: vi.fn(async () => null),
      upsert: vi.fn(async () => {}),
      ...overrides,
    };
  }

  it("starts from flat when no position exists yet", async () => {
    const repository = createFakeRepository();
    const manager = new PositionStateManager({
      repository,
      clock: () => "2026-09-11T09:00:00.000Z",
    });

    const result = await manager.applyFill("CRUDEOIL25DECFUT", "MCX", {
      side: OrderSide.BUY,
      quantity: 100,
      price: 6250.5,
      filledAt: "2026-09-11T09:15:00.000Z",
    });

    expect(result.netQuantity).toBe(100);
    expect(repository.upsert).toHaveBeenCalledWith(result);
  });

  it("returns null from markToMarket when there is no position to mark", async () => {
    const repository = createFakeRepository();
    const manager = new PositionStateManager({ repository });

    const result = await manager.markToMarket("CRUDEOIL25DECFUT", "MCX", 6300);

    expect(result).toBeNull();
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
