import { roundToTick } from "#domain/money.js";
import { createSeededRandom } from "#broker/mock/seeded-random.js";

export class MockPriceFeed {
  constructor({ instrumentToken, startPrice, tickSize, volatility = 0.0015, seed = 1 }) {
    if (!Number.isFinite(startPrice) || startPrice <= 0) {
      throw new Error("startPrice must be a positive number");
    }
    this.instrumentToken = instrumentToken;
    this.tickSize = tickSize;
    this.volatility = volatility;
    this.lastPrice = roundToTick(startPrice, tickSize);
    this.random = createSeededRandom(seed);
    this.listeners = new Set();
    this.timer = null;
  }

  onTick(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(intervalMs = 1000) {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.emitTick(), intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  emitTick() {
    const drift = (this.random() - 0.5) * 2 * this.volatility * this.lastPrice;
    this.lastPrice = roundToTick(Math.max(this.lastPrice + drift, this.tickSize), this.tickSize);
    const tick = { instrument_token: this.instrumentToken, last_price: this.lastPrice };
    for (const listener of this.listeners) {
      listener(tick);
    }
    return tick;
  }
}
