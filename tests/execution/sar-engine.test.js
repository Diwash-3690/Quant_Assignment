import { describe, expect, it, vi } from "vitest";
import {
  computeStopPrice,
  decidePyramidAdd,
  evaluateKillSwitch,
  SarDirection,
  SarEngine,
} from "#execution/sar-engine.js";
import { OrderSide, OrderType } from "#domain/order.js";

describe("computeStopPrice", () => {
  it("places a long stop below the favorable price by atr times the multiplier", () => {
    expect(computeStopPrice(SarDirection.LONG, 6250, 50, { stopMultiplier: 2, tickSize: 1 })).toBe(6150);
  });

  it("places a short stop above the favorable price", () => {
    expect(computeStopPrice(SarDirection.SHORT, 6250, 50, { stopMultiplier: 2, tickSize: 1 })).toBe(6350);
  });
});

describe("evaluateKillSwitch", () => {
  const config = { maxLossAmount: 5000, maxPositionQuantity: 300 };

  it("does not trigger within loss and position bounds", () => {
    const sarState = { position: { netQuantity: 100 } };
    const result = evaluateKillSwitch(sarState, { realizedPnl: 0, unrealizedPnl: 0 }, config);
    expect(result.triggered).toBe(false);
  });

  it("triggers on combined realized and unrealized loss", () => {
    const sarState = { position: { netQuantity: 100 } };
    const result = evaluateKillSwitch(sarState, { realizedPnl: -3000, unrealizedPnl: -2500 }, config);
    expect(result).toEqual({ triggered: true, reason: "max loss breached" });
  });

  it("triggers when the position cap is breached", () => {
    const sarState = { position: { netQuantity: 350 } };
    const result = evaluateKillSwitch(sarState, { realizedPnl: 0, unrealizedPnl: 0 }, config);
    expect(result).toEqual({ triggered: true, reason: "position cap breached" });
  });
});

describe("decidePyramidAdd", () => {
  const config = { maxPyramidLevels: 2, pyramidStepMultiplier: 1, quantityPerAdd: 100, maxPositionQuantity: 300 };

  it("adds when price has moved a full atr step favorably", () => {
    const sarState = {
      direction: SarDirection.LONG,
      pyramidCount: 0,
      lastPyramidPrice: 6250,
      position: { netQuantity: 100 },
    };
    expect(decidePyramidAdd(sarState, { lastPrice: 6300, atr: 50 }, config)).toEqual({ quantity: 100 });
  });

  it("does not add before a full atr step has happened", () => {
    const sarState = {
      direction: SarDirection.LONG,
      pyramidCount: 0,
      lastPyramidPrice: 6250,
      position: { netQuantity: 100 },
    };
    expect(decidePyramidAdd(sarState, { lastPrice: 6290, atr: 50 }, config)).toBeNull();
  });

  it("does not add past the configured max pyramid levels", () => {
    const sarState = {
      direction: SarDirection.LONG,
      pyramidCount: 2,
      lastPyramidPrice: 6250,
      position: { netQuantity: 100 },
    };
    expect(decidePyramidAdd(sarState, { lastPrice: 6400, atr: 50 }, config)).toBeNull();
  });

  it("does not add if doing so would breach the position cap", () => {
    const sarState = {
      direction: SarDirection.LONG,
      pyramidCount: 0,
      lastPyramidPrice: 6250,
      position: { netQuantity: 250 },
    };
    expect(decidePyramidAdd(sarState, { lastPrice: 6300, atr: 50 }, config)).toBeNull();
  });
});

function createFakeOrderStateManager() {
  return {
    placeOrder: vi.fn(async () => ({})),
    cancelOrder: vi.fn(async () => ({})),
  };
}

const baseConfig = {
  stopMultiplier: 2,
  maxLossAmount: 5000,
  maxPositionQuantity: 300,
  maxPyramidLevels: 2,
  pyramidStepMultiplier: 1,
  quantityPerAdd: 100,
  reversalQuantity: 100,
};

function createEngine(overrides = {}) {
  return new SarEngine({
    tradingSymbol: "CRUDEOIL25DECFUT",
    exchange: "MCX",
    tickSize: 1,
    orderStateManager: createFakeOrderStateManager(),
    config: baseConfig,
    clock: () => "2026-09-11T09:00:00.000Z",
    ...overrides,
  });
}

describe("SarEngine", () => {
  it("throws if ticked before start", async () => {
    const engine = createEngine();
    await expect(engine.onTick({ lastPrice: 6250, atr: 50, realizedPnl: 0, unrealizedPnl: 0 })).rejects.toThrow(
      "not been started",
    );
  });

  it("opens the position and places the initial stop on start", async () => {
    const orderStateManager = createFakeOrderStateManager();
    const engine = createEngine({ orderStateManager });

    await engine.start(SarDirection.LONG, 6250, 100, 50);

    expect(engine.state.position).toMatchObject({ netQuantity: 100, averagePrice: 6250, realizedPnl: 0 });
    expect(engine.state.stopPrice).toBe(6150);
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith({
      idempotencyKey: "sar-CRUDEOIL25DECFUT-stop-1-0",
      tradingSymbol: "CRUDEOIL25DECFUT",
      exchange: "MCX",
      side: OrderSide.SELL,
      orderType: OrderType.SL_M,
      quantity: 100,
      price: null,
      triggerPrice: 6150,
    });
  });

  it("pyramids on a full atr favorable move, re-averaging the position and trailing the stop", async () => {
    const orderStateManager = createFakeOrderStateManager();
    const engine = createEngine({ orderStateManager });
    await engine.start(SarDirection.LONG, 6250, 100, 50);
    orderStateManager.placeOrder.mockClear();

    const result = await engine.onTick({ lastPrice: 6300, atr: 50, realizedPnl: 0, unrealizedPnl: 2500 });

    expect(result).toEqual({ action: "pyramided", quantity: 100 });
    expect(engine.state.position.netQuantity).toBe(200);
    expect(engine.state.position.averagePrice).toBe(6275);
    expect(engine.state.stopPrice).toBe(6200);
    expect(orderStateManager.cancelOrder).toHaveBeenCalledWith("sar-CRUDEOIL25DECFUT-stop-1-0");
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "sar-CRUDEOIL25DECFUT-add-1-0",
        side: OrderSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 100,
      }),
    );
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "sar-CRUDEOIL25DECFUT-stop-1-1",
        triggerPrice: 6200,
        quantity: 200,
      }),
    );
  });

  it("does nothing on a tick with no pyramid trigger", async () => {
    const engine = createEngine();
    await engine.start(SarDirection.LONG, 6250, 100, 50);

    const result = await engine.onTick({ lastPrice: 6260, atr: 50, realizedPnl: 0, unrealizedPnl: 1000 });

    expect(result).toEqual({ action: "no-op" });
  });

  it("closes and reverses on a stop fill, carrying realized P&L forward", async () => {
    const orderStateManager = createFakeOrderStateManager();
    const engine = createEngine({ orderStateManager });
    await engine.start(SarDirection.LONG, 6250, 100, 50);
    orderStateManager.placeOrder.mockClear();

    const result = await engine.onStopFilled(6150, 40);

    expect(result).toEqual({ action: "reversed", direction: SarDirection.SHORT });
    expect(engine.state.direction).toBe(SarDirection.SHORT);
    expect(engine.state.position).toMatchObject({
      netQuantity: -100,
      averagePrice: 6150,
      realizedPnl: -10000,
    });
    expect(engine.state.stopPrice).toBe(6230);
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "sar-CRUDEOIL25DECFUT-stop-2-0",
        side: OrderSide.BUY,
        triggerPrice: 6230,
        quantity: 100,
      }),
    );
  });

  it("cancels the resting stop and flattens on a kill switch trip, then no-ops afterward", async () => {
    const orderStateManager = createFakeOrderStateManager();
    const engine = createEngine({ orderStateManager });
    await engine.start(SarDirection.LONG, 6250, 100, 50);
    orderStateManager.placeOrder.mockClear();

    const first = await engine.onTick({ lastPrice: 6250, atr: 50, realizedPnl: -3000, unrealizedPnl: -2500 });

    expect(first).toEqual({ action: "kill-switch-triggered", reason: "max loss breached" });
    expect(orderStateManager.cancelOrder).toHaveBeenCalledWith("sar-CRUDEOIL25DECFUT-stop-1-0");
    expect(orderStateManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "sar-CRUDEOIL25DECFUT-flatten-1-0",
        side: OrderSide.SELL,
        orderType: OrderType.MARKET,
        quantity: 100,
      }),
    );

    orderStateManager.placeOrder.mockClear();
    const second = await engine.onTick({ lastPrice: 6250, atr: 50, realizedPnl: -3000, unrealizedPnl: -2500 });
    expect(second).toEqual({ action: "kill-switch-active" });
    expect(orderStateManager.placeOrder).not.toHaveBeenCalled();
  });

  it("dispatches a critical alert when the kill switch trips", async () => {
    const alertDispatcher = { dispatch: vi.fn(async () => {}) };
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const engine = createEngine({ alertDispatcher, logger });
    await engine.start(SarDirection.LONG, 6250, 100, 50);

    await engine.onTick({ lastPrice: 6250, atr: 50, realizedPnl: -3000, unrealizedPnl: -2500 });

    expect(logger.warn).toHaveBeenCalledWith(
      { tradingSymbol: "CRUDEOIL25DECFUT", reason: "max loss breached" },
      "sar kill switch triggered",
    );
    expect(alertDispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "CRITICAL",
        title: "SAR kill switch: CRUDEOIL25DECFUT",
        message: "max loss breached",
      }),
    );
  });

  it("logs a trade blotter entry on reversal", async () => {
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const engine = createEngine({ logger });
    await engine.start(SarDirection.LONG, 6250, 100, 50);

    await engine.onStopFilled(6150, 40);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        blotter: expect.objectContaining({
          side: OrderSide.SELL,
          quantity: 100,
          price: 6150,
          strategy: "sar-reverse",
        }),
      }),
      "trade executed",
    );
  });
});
