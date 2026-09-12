import { describe, expect, it, vi } from "vitest";
import {
  assertValidGridLegTransition,
  buildGridLevels,
  buildIdempotencyKey,
  computeExitOrder,
  decidePendingEntries,
  evaluateKillSwitch,
  extendGridIfNeeded,
  GridEngine,
  GridLegStatus,
} from "#execution/grid-engine.js";
import { OrderSide, OrderType } from "#domain/order.js";

describe("buildGridLevels", () => {
  it("builds symmetric buy and sell legs spaced by the grid interval", () => {
    const legs = buildGridLevels({
      referencePrice: 6250,
      gridSpacing: 50,
      tickSize: 1,
      legsPerSide: 2,
      quantityPerLeg: 100,
    });

    expect(legs).toEqual([
      { offset: -1, price: 6200, side: OrderSide.BUY, status: GridLegStatus.PENDING, quantity: 100, cycle: 0 },
      { offset: 1, price: 6300, side: OrderSide.SELL, status: GridLegStatus.PENDING, quantity: 100, cycle: 0 },
      { offset: -2, price: 6150, side: OrderSide.BUY, status: GridLegStatus.PENDING, quantity: 100, cycle: 0 },
      { offset: 2, price: 6350, side: OrderSide.SELL, status: GridLegStatus.PENDING, quantity: 100, cycle: 0 },
    ]);
  });
});

describe("evaluateKillSwitch", () => {
  const gridState = { referencePrice: 6250, gridSpacing: 50 };
  const config = { maxDeviationSpacings: 3, maxLossAmount: 5000 };

  it("does not trigger within normal deviation and P&L bounds", () => {
    const result = evaluateKillSwitch(gridState, { lastPrice: 6250, realizedPnl: 0, unrealizedPnl: 0 }, config);
    expect(result.triggered).toBe(false);
  });

  it("triggers when price deviates beyond the configured number of spacings", () => {
    const result = evaluateKillSwitch(
      gridState,
      { lastPrice: 6410, realizedPnl: 0, unrealizedPnl: 0 },
      config,
    );
    expect(result).toEqual({ triggered: true, reason: "price moved beyond max grid deviation" });
  });

  it("triggers when combined realized and unrealized loss breaches the max loss", () => {
    const result = evaluateKillSwitch(
      gridState,
      { lastPrice: 6250, realizedPnl: -3000, unrealizedPnl: -2500 },
      config,
    );
    expect(result).toEqual({ triggered: true, reason: "max loss breached" });
  });
});

describe("decidePendingEntries", () => {
  const config = { maxPositionQuantityPerSide: 150 };

  it("accepts pending legs up to the per-side position cap and rejects the rest", () => {
    const gridState = {
      legs: buildGridLevels({
        referencePrice: 6250,
        gridSpacing: 50,
        tickSize: 1,
        legsPerSide: 2,
        quantityPerLeg: 100,
      }),
    };

    const entries = decidePendingEntries(gridState, config);

    expect(entries.map((leg) => leg.offset)).toEqual([-1, 1]);
  });

  it("accounts for exposure already open when applying the cap", () => {
    const gridState = {
      legs: [
        { offset: -1, side: OrderSide.BUY, status: GridLegStatus.OPEN, quantity: 100 },
        { offset: -2, side: OrderSide.BUY, status: GridLegStatus.PENDING, quantity: 100 },
      ],
    };

    const entries = decidePendingEntries(gridState, config);

    expect(entries).toEqual([]);
  });
});

describe("extendGridIfNeeded", () => {
  const config = { maxLegsPerSide: 3, quantityPerLeg: 100, tickSize: 1 };
  const gridState = { referencePrice: 6250, gridSpacing: 50 };

  it("adds one more buy leg once every existing buy leg has filled", () => {
    const state = {
      ...gridState,
      legs: [
        { offset: -1, side: OrderSide.BUY, status: GridLegStatus.FILLED },
        { offset: -2, side: OrderSide.BUY, status: GridLegStatus.FILLED },
        { offset: 1, side: OrderSide.SELL, status: GridLegStatus.PENDING },
      ],
    };

    const newLegs = extendGridIfNeeded(state, config);

    expect(newLegs).toEqual([
      { offset: -3, price: 6100, side: OrderSide.BUY, status: GridLegStatus.PENDING, quantity: 100, cycle: 0 },
    ]);
  });

  it("does not extend past the configured max legs per side", () => {
    const state = {
      ...gridState,
      legs: [
        { offset: -1, side: OrderSide.BUY, status: GridLegStatus.FILLED },
        { offset: -2, side: OrderSide.BUY, status: GridLegStatus.FILLED },
        { offset: -3, side: OrderSide.BUY, status: GridLegStatus.FILLED },
      ],
    };

    expect(extendGridIfNeeded(state, config)).toEqual([]);
  });

  it("does not extend a side that is not yet fully filled", () => {
    const state = {
      ...gridState,
      legs: [
        { offset: -1, side: OrderSide.BUY, status: GridLegStatus.FILLED },
        { offset: -2, side: OrderSide.BUY, status: GridLegStatus.OPEN },
      ],
    };

    expect(extendGridIfNeeded(state, config)).toEqual([]);
  });
});

describe("computeExitOrder", () => {
  const gridState = { gridSpacing: 50 };
  const config = { tickSize: 1 };

  it("places the exit one spacing above a filled buy leg", () => {
    const exit = computeExitOrder({ side: OrderSide.BUY, price: 6200, quantity: 100 }, gridState, config);
    expect(exit).toEqual({ side: OrderSide.SELL, price: 6250, quantity: 100 });
  });

  it("places the exit one spacing below a filled sell leg", () => {
    const exit = computeExitOrder({ side: OrderSide.SELL, price: 6300, quantity: 100 }, gridState, config);
    expect(exit).toEqual({ side: OrderSide.BUY, price: 6250, quantity: 100 });
  });
});

describe("assertValidGridLegTransition", () => {
  it("allows the documented lifecycle", () => {
    expect(() => assertValidGridLegTransition(GridLegStatus.PENDING, GridLegStatus.OPEN)).not.toThrow();
    expect(() => assertValidGridLegTransition(GridLegStatus.FILLED, GridLegStatus.CLOSED)).not.toThrow();
    expect(() => assertValidGridLegTransition(GridLegStatus.CLOSED, GridLegStatus.PENDING)).not.toThrow();
  });

  it("rejects skipping a step", () => {
    expect(() => assertValidGridLegTransition(GridLegStatus.PENDING, GridLegStatus.FILLED)).toThrow();
  });
});

function createFakeOrderStateManager(overrides = {}) {
  return {
    placeOrder: vi.fn(async () => ({})),
    cancelOrder: vi.fn(async () => ({})),
    ...overrides,
  };
}

const baseConfig = {
  spacingMultiplier: 1,
  legsPerSide: 2,
  quantityPerLeg: 100,
  maxPositionQuantityPerSide: 150,
  maxLegsPerSide: 3,
  maxDeviationSpacings: 3,
  maxLossAmount: 5000,
};

function createEngine(overrides = {}) {
  return new GridEngine({
    tradingSymbol: "CRUDEOIL25DECFUT",
    exchange: "MCX",
    tickSize: 1,
    orderStateManager: createFakeOrderStateManager(),
    config: baseConfig,
    ...overrides,
  });
}

describe("GridEngine", () => {
  it("throws if ticked before start", async () => {
    const engine = createEngine();
    await expect(engine.onTick({ lastPrice: 6250, realizedPnl: 0, unrealizedPnl: 0 })).rejects.toThrow(
      "not been started",
    );
  });

  it("places entry orders for the legs the position cap allows, and opens them", async () => {
    const orderStateManager = createFakeOrderStateManager();
    const engine = createEngine({ orderStateManager });
    engine.start(6250, 50);

    const result = await engine.onTick({ lastPrice: 6250, realizedPnl: 0, unrealizedPnl: 0 });

    expect(result).toEqual({ action: "entries-evaluated", placed: 2 });
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: buildIdempotencyKey("CRUDEOIL25DECFUT", -1, 0, "entry"),
        side: OrderSide.BUY,
        orderType: OrderType.LIMIT,
        price: 6200,
        quantity: 100,
      }),
    );
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: buildIdempotencyKey("CRUDEOIL25DECFUT", 1, 0, "entry"),
        side: OrderSide.SELL,
        price: 6300,
      }),
    );

    const buyLeg = engine.state.legs.find((leg) => leg.offset === -1);
    expect(buyLeg.status).toBe(GridLegStatus.OPEN);
  });

  it("places an exit order once an entry fills, and resets to PENDING once the exit fills", async () => {
    const orderStateManager = createFakeOrderStateManager();
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const engine = createEngine({ orderStateManager, logger });
    engine.start(6250, 50);
    await engine.onTick({ lastPrice: 6250, realizedPnl: 0, unrealizedPnl: 0 });

    const entryKey = buildIdempotencyKey("CRUDEOIL25DECFUT", -1, 0, "entry");
    await engine.onEntryFilled(entryKey);

    const exitKey = buildIdempotencyKey("CRUDEOIL25DECFUT", -1, 0, "exit");
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: exitKey,
        side: OrderSide.SELL,
        price: 6250,
        quantity: 100,
      }),
    );
    const filledLeg = engine.state.legs.find((leg) => leg.offset === -1);
    expect(filledLeg.status).toBe(GridLegStatus.FILLED);

    await engine.onExitFilled(exitKey, 6250);

    const resetLeg = engine.state.legs.find((leg) => leg.offset === -1);
    expect(resetLeg.status).toBe(GridLegStatus.PENDING);
    expect(resetLeg.cycle).toBe(1);
    expect(engine.legsByExitKey.has(exitKey)).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        blotter: expect.objectContaining({ idempotencyKey: exitKey, price: 6250, strategy: "grid-exit" }),
      }),
      "trade executed",
    );
  });

  it("rejects onEntryFilled and onExitFilled for unknown idempotency keys", async () => {
    const engine = createEngine();
    engine.start(6250, 50);

    await expect(engine.onEntryFilled("unknown")).rejects.toThrow("no grid leg found");
    await expect(engine.onExitFilled("unknown")).rejects.toThrow("no grid leg found");
  });

  it("halts entries and reports kill-switch-active once triggered", async () => {
    const orderStateManager = createFakeOrderStateManager();
    const engine = createEngine({ orderStateManager });
    engine.start(6250, 50);

    const first = await engine.onTick({ lastPrice: 6410, realizedPnl: 0, unrealizedPnl: 0 });
    expect(first.action).toBe("kill-switch-triggered");
    expect(orderStateManager.placeOrder).not.toHaveBeenCalled();

    const second = await engine.onTick({ lastPrice: 6250, realizedPnl: 0, unrealizedPnl: 0 });
    expect(second).toEqual({ action: "kill-switch-active" });
    expect(orderStateManager.placeOrder).not.toHaveBeenCalled();
  });

  it("cancels resting orders and flattens filled legs when the kill switch trips", async () => {
    const orderStateManager = createFakeOrderStateManager();
    const engine = createEngine({ orderStateManager });
    engine.start(6250, 50);

    const openLeg = engine.state.legs.find((leg) => leg.offset === 1);
    openLeg.status = GridLegStatus.OPEN;
    engine.legsByEntryKey.set(buildIdempotencyKey("CRUDEOIL25DECFUT", 1, 0, "entry"), openLeg);

    const filledLeg = engine.state.legs.find((leg) => leg.offset === -1);
    filledLeg.status = GridLegStatus.FILLED;
    const exitKey = buildIdempotencyKey("CRUDEOIL25DECFUT", -1, 0, "exit");
    engine.legsByExitKey.set(exitKey, filledLeg);

    const result = await engine.triggerKillSwitch("manual test");

    expect(orderStateManager.cancelOrder).toHaveBeenCalledWith(
      buildIdempotencyKey("CRUDEOIL25DECFUT", 1, 0, "entry"),
    );
    expect(orderStateManager.cancelOrder).toHaveBeenCalledWith(exitKey);
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: buildIdempotencyKey("CRUDEOIL25DECFUT", -1, 0, "flatten"),
        side: OrderSide.SELL,
        orderType: OrderType.MARKET,
        quantity: 100,
      }),
    );
    expect(result).toEqual({ action: "kill-switch-triggered", reason: "manual test", flattened: [-1] });
    expect(engine.state.killSwitchActive).toBe(true);
  });

  it("dispatches a critical alert when the kill switch trips", async () => {
    const alertDispatcher = { dispatch: vi.fn(async () => {}) };
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const engine = createEngine({ alertDispatcher, logger, clock: () => "2026-09-11T09:15:00.000Z" });
    engine.start(6250, 50);

    await engine.triggerKillSwitch("max loss breached");

    expect(logger.warn).toHaveBeenCalledWith(
      { tradingSymbol: "CRUDEOIL25DECFUT", reason: "max loss breached" },
      "grid kill switch triggered",
    );
    expect(alertDispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "CRITICAL",
        title: "Grid kill switch: CRUDEOIL25DECFUT",
        message: "max loss breached",
        raisedAt: "2026-09-11T09:15:00.000Z",
      }),
    );
  });

  it("logs a trade blotter entry when a grid entry fills", async () => {
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const engine = createEngine({ logger, clock: () => "2026-09-11T09:15:00.000Z" });
    engine.start(6250, 50);
    await engine.onTick({ lastPrice: 6250, realizedPnl: 0, unrealizedPnl: 0 });

    const entryKey = buildIdempotencyKey("CRUDEOIL25DECFUT", -1, 0, "entry");
    await engine.onEntryFilled(entryKey);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        blotter: expect.objectContaining({
          idempotencyKey: entryKey,
          side: OrderSide.BUY,
          quantity: 100,
          price: 6200,
          strategy: "grid-entry",
          filledAt: "2026-09-11T09:15:00.000Z",
        }),
      }),
      "trade executed",
    );
  });
});
