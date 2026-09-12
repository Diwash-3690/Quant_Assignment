import { describe, it, expect, afterEach, vi } from "vitest";
import { MockPriceFeed } from "#broker/mock/price-feed.js";

describe("MockPriceFeed", () => {
  let feed;

  afterEach(() => {
    feed?.stop();
    vi.useRealTimers();
  });

  it("produces the same price sequence for the same seed", () => {
    const feedA = new MockPriceFeed({
      instrumentToken: 1,
      startPrice: 6500,
      tickSize: 1,
      seed: 42,
    });
    const feedB = new MockPriceFeed({
      instrumentToken: 1,
      startPrice: 6500,
      tickSize: 1,
      seed: 42,
    });

    const sequenceA = Array.from({ length: 5 }, () => feedA.emitTick().last_price);
    const sequenceB = Array.from({ length: 5 }, () => feedB.emitTick().last_price);

    expect(sequenceA).toEqual(sequenceB);
  });

  it("keeps every emitted price a multiple of the tick size", () => {
    feed = new MockPriceFeed({ instrumentToken: 1, startPrice: 6500, tickSize: 5, seed: 7 });

    for (let i = 0; i < 20; i += 1) {
      const tick = feed.emitTick();
      expect(tick.last_price % 5).toBe(0);
    }
  });

  it("never emits a price below one tick size", () => {
    feed = new MockPriceFeed({
      instrumentToken: 1,
      startPrice: 1,
      tickSize: 1,
      volatility: 5,
      seed: 3,
    });

    for (let i = 0; i < 50; i += 1) {
      expect(feed.emitTick().last_price).toBeGreaterThanOrEqual(1);
    }
  });

  it("notifies listeners on every emitted tick", () => {
    feed = new MockPriceFeed({ instrumentToken: 9, startPrice: 100, tickSize: 1, seed: 1 });
    const listener = vi.fn();
    feed.onTick(listener);

    feed.emitTick();
    feed.emitTick();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0]).toMatchObject({ instrument_token: 9 });
  });

  it("stops emitting once stop() is called", () => {
    vi.useFakeTimers();
    feed = new MockPriceFeed({ instrumentToken: 1, startPrice: 100, tickSize: 1, seed: 1 });
    const listener = vi.fn();
    feed.onTick(listener);

    feed.start(100);
    vi.advanceTimersByTime(250);
    feed.stop();
    vi.advanceTimersByTime(500);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
