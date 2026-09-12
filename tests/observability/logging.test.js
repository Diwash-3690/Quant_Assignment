import { describe, expect, it, vi } from "vitest";
import { createTradeBlotterEntry, logTrade } from "#observability/logging.js";

describe("createTradeBlotterEntry", () => {
  it("shapes a fill into a canonical blotter record", () => {
    const entry = createTradeBlotterEntry({
      idempotencyKey: "grid-CRUDEOIL25DECFUT--1-entry-0",
      brokerOrderId: "kite-order-1",
      tradingSymbol: "CRUDEOIL25DECFUT",
      exchange: "MCX",
      side: "BUY",
      quantity: 100,
      price: 6200,
      cost: 20,
      strategy: "grid",
      filledAt: "2026-09-11T09:15:00.000Z",
    });

    expect(entry).toEqual({
      idempotencyKey: "grid-CRUDEOIL25DECFUT--1-entry-0",
      brokerOrderId: "kite-order-1",
      tradingSymbol: "CRUDEOIL25DECFUT",
      exchange: "MCX",
      side: "BUY",
      quantity: 100,
      price: 6200,
      cost: 20,
      strategy: "grid",
      filledAt: "2026-09-11T09:15:00.000Z",
    });
  });
});

describe("logTrade", () => {
  it("logs the blotter entry at info level under a consistent key", () => {
    const logger = { info: vi.fn() };
    const entry = { idempotencyKey: "k1" };

    logTrade(logger, entry);

    expect(logger.info).toHaveBeenCalledWith({ blotter: entry }, "trade executed");
  });
});
