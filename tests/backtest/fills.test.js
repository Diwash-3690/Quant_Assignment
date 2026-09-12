import { describe, expect, it } from "vitest";
import { simulateFill } from "#backtest/fills.js";
import { OrderSide, OrderType } from "#domain/order.js";

describe("simulateFill", () => {
  it("fills a market order at the bar open", () => {
    const order = { orderType: OrderType.MARKET };
    const bar = { open: 100, high: 105, low: 95, close: 102 };
    expect(simulateFill(order, bar)).toEqual({ filled: true, price: 100 });
  });

  describe("limit orders", () => {
    it("does not fill a buy limit the bar never reaches", () => {
      const order = { orderType: OrderType.LIMIT, side: OrderSide.BUY, price: 100 };
      const bar = { open: 105, high: 106, low: 101, close: 104 };
      expect(simulateFill(order, bar)).toEqual({ filled: false });
    });

    it("fills a buy limit at the limit price when touched but not gapped through", () => {
      const order = { orderType: OrderType.LIMIT, side: OrderSide.BUY, price: 100 };
      const bar = { open: 105, high: 106, low: 98, close: 102 };
      expect(simulateFill(order, bar)).toEqual({ filled: true, price: 100 });
    });

    it("fills a buy limit at the open when the market gaps below it (price improvement)", () => {
      const order = { orderType: OrderType.LIMIT, side: OrderSide.BUY, price: 100 };
      const bar = { open: 95, high: 97, low: 93, close: 96 };
      expect(simulateFill(order, bar)).toEqual({ filled: true, price: 95 });
    });

    it("fills a sell limit at the open when the market gaps above it (price improvement)", () => {
      const order = { orderType: OrderType.LIMIT, side: OrderSide.SELL, price: 100 };
      const bar = { open: 103, high: 105, low: 102, close: 104 };
      expect(simulateFill(order, bar)).toEqual({ filled: true, price: 103 });
    });

    it("does not fill a sell limit the bar never reaches", () => {
      const order = { orderType: OrderType.LIMIT, side: OrderSide.SELL, price: 100 };
      const bar = { open: 95, high: 99, low: 93, close: 96 };
      expect(simulateFill(order, bar)).toEqual({ filled: false });
    });
  });

  describe("stop-market orders", () => {
    it("fills a sell stop at the trigger when touched but not gapped through", () => {
      const order = { orderType: OrderType.SL_M, side: OrderSide.SELL, triggerPrice: 100 };
      const bar = { open: 105, high: 106, low: 95, close: 98 };
      expect(simulateFill(order, bar)).toEqual({ filled: true, price: 100 });
    });

    it("fills a sell stop at the open when the market gaps down through it (slippage)", () => {
      const order = { orderType: OrderType.SL_M, side: OrderSide.SELL, triggerPrice: 100 };
      const bar = { open: 90, high: 92, low: 88, close: 89 };
      expect(simulateFill(order, bar)).toEqual({ filled: true, price: 90 });
    });

    it("fills a buy stop at the open when the market gaps up through it (slippage)", () => {
      const order = { orderType: OrderType.SL_M, side: OrderSide.BUY, triggerPrice: 100 };
      const bar = { open: 110, high: 112, low: 108, close: 109 };
      expect(simulateFill(order, bar)).toEqual({ filled: true, price: 110 });
    });

    it("does not trigger a stop the bar never reaches", () => {
      const order = { orderType: OrderType.SL_M, side: OrderSide.SELL, triggerPrice: 100 };
      const bar = { open: 105, high: 106, low: 101, close: 103 };
      expect(simulateFill(order, bar)).toEqual({ filled: false });
    });
  });

  it("throws for an order type it does not model", () => {
    const order = { orderType: OrderType.SL, side: OrderSide.SELL, triggerPrice: 100, price: 99 };
    const bar = { open: 100, high: 101, low: 99, close: 100 };
    expect(() => simulateFill(order, bar)).toThrow("does not support order type");
  });
});
