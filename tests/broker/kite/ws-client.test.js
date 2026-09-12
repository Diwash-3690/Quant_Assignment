import { describe, expect, it, vi } from "vitest";
import { KiteWsClient } from "#broker/kite/ws-client.js";

function createFakeTicker() {
  const handlers = new Map();
  return {
    handlers,
    on(event, handler) {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event).push(handler);
    },
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) {
        handler(...args);
      }
    },
    modeFull: "full",
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: vi.fn(() => true),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    setMode: vi.fn(),
    autoReconnect: vi.fn(),
  };
}

function flush(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("KiteWsClient", () => {
  it("resubscribes every tracked token on connect", () => {
    const ticker = createFakeTicker();
    ticker.connected.mockReturnValue(false);
    const client = new KiteWsClient({ ticker });

    client.subscribe([101, 102]);
    expect(ticker.subscribe).not.toHaveBeenCalled();

    ticker.emit("connect");

    expect(ticker.subscribe).toHaveBeenCalledWith([101, 102]);
    expect(ticker.setMode).toHaveBeenCalledWith("full", [101, 102]);
  });

  it("subscribes immediately when already connected", () => {
    const ticker = createFakeTicker();
    const client = new KiteWsClient({ ticker });

    client.subscribe([101]);

    expect(ticker.subscribe).toHaveBeenCalledWith([101]);
  });

  it("drops a token from tracking and calls unsubscribe when connected", () => {
    const ticker = createFakeTicker();
    const client = new KiteWsClient({ ticker });

    client.subscribe([101]);
    client.unsubscribe([101]);

    expect(ticker.unsubscribe).toHaveBeenCalledWith([101]);
    expect(client.subscribedTokens.has(101)).toBe(false);
  });

  it("delivers ticks to registered handlers", async () => {
    const ticker = createFakeTicker();
    const client = new KiteWsClient({ ticker });
    const handler = vi.fn();
    client.onTick(handler);

    ticker.emit("ticks", [{ instrument_token: 101, last_price: 100 }]);
    await flush();

    expect(handler).toHaveBeenCalledWith([{ instrument_token: 101, last_price: 100 }]);
  });

  it("conflates ticks per instrument while a handler is still processing", async () => {
    const ticker = createFakeTicker();
    const client = new KiteWsClient({ ticker });
    const received = [];
    let callCount = 0;
    let releaseFirstCall;
    const firstCallStarted = new Promise((resolve) => {
      releaseFirstCall = resolve;
    });

    client.onTick(async (ticks) => {
      callCount += 1;
      received.push(ticks);
      if (callCount === 1) {
        releaseFirstCall();
        await flush(20);
      }
    });

    ticker.emit("ticks", [{ instrument_token: 1, last_price: 100 }]);
    await firstCallStarted;
    ticker.emit("ticks", [{ instrument_token: 1, last_price: 101 }]);
    ticker.emit("ticks", [{ instrument_token: 1, last_price: 102 }]);

    await flush(40);

    expect(callCount).toBe(2);
    expect(received[1]).toEqual([{ instrument_token: 1, last_price: 102 }]);
  });

  it("forwards order updates to registered handlers", () => {
    const ticker = createFakeTicker();
    const client = new KiteWsClient({ ticker });
    const handler = vi.fn();
    client.onOrderUpdate(handler);

    ticker.emit("order_update", { order_id: "kite-order-1", status: "COMPLETE" });

    expect(handler).toHaveBeenCalledWith({ order_id: "kite-order-1", status: "COMPLETE" });
  });

  it("logs and continues when a tick handler throws", async () => {
    const ticker = createFakeTicker();
    const logger = { error: vi.fn() };
    const client = new KiteWsClient({ ticker, logger });
    const goodHandler = vi.fn();
    client.onTick(() => {
      throw new Error("handler blew up");
    });
    client.onTick(goodHandler);

    ticker.emit("ticks", [{ instrument_token: 1, last_price: 100 }]);
    await flush();

    expect(logger.error).toHaveBeenCalledWith("tick handler failed", expect.any(Error));
    expect(goodHandler).toHaveBeenCalled();
  });

  it("suppresses the disconnect log during a deliberate shutdown", () => {
    const ticker = createFakeTicker();
    const logger = { error: vi.fn() };
    const client = new KiteWsClient({ ticker, logger });

    client.disconnect();
    ticker.emit("disconnect", new Error("socket closed"));

    expect(ticker.disconnect).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs an unexpected disconnect", () => {
    const ticker = createFakeTicker();
    const logger = { error: vi.fn() };
    const client = new KiteWsClient({ ticker, logger });

    ticker.emit("disconnect", new Error("socket closed"));

    expect(logger.error).toHaveBeenCalledWith("kite ws disconnected unexpectedly", expect.any(Error));
  });
});
