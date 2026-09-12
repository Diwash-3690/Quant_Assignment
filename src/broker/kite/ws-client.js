export class KiteWsClient {
  constructor({ ticker, logger = console }) {
    this.ticker = ticker;
    this.logger = logger;
    this.subscribedTokens = new Set();
    this.pendingTicks = new Map();
    this.tickHandlers = new Set();
    this.orderUpdateHandlers = new Set();
    this.isDraining = false;
    this.isShuttingDown = false;

    this.ticker.on("connect", () => this.handleConnect());
    this.ticker.on("ticks", (ticks) => this.handleTicks(ticks));
    this.ticker.on("order_update", (update) => this.handleOrderUpdate(update));
    this.ticker.on("disconnect", (error) => this.handleDisconnect(error));
    this.ticker.on("error", (error) => this.handleError(error));
    this.ticker.on("noreconnect", () => this.handleNoReconnect());
  }

  connect() {
    this.isShuttingDown = false;
    this.ticker.autoReconnect(true, -1, 5);
    this.ticker.connect();
  }

  disconnect() {
    this.isShuttingDown = true;
    this.ticker.disconnect();
  }

  onTick(handler) {
    this.tickHandlers.add(handler);
  }

  onOrderUpdate(handler) {
    this.orderUpdateHandlers.add(handler);
  }

  subscribe(instrumentTokens) {
    for (const token of instrumentTokens) {
      this.subscribedTokens.add(token);
    }
    if (this.ticker.connected()) {
      this.ticker.subscribe(instrumentTokens);
      this.ticker.setMode(this.ticker.modeFull, instrumentTokens);
    }
  }

  unsubscribe(instrumentTokens) {
    for (const token of instrumentTokens) {
      this.subscribedTokens.delete(token);
      this.pendingTicks.delete(token);
    }
    if (this.ticker.connected()) {
      this.ticker.unsubscribe(instrumentTokens);
    }
  }

  handleConnect() {
    if (this.subscribedTokens.size === 0) {
      return;
    }
    const tokens = Array.from(this.subscribedTokens);
    this.ticker.subscribe(tokens);
    this.ticker.setMode(this.ticker.modeFull, tokens);
  }

  handleTicks(ticks) {
    for (const tick of ticks) {
      this.pendingTicks.set(tick.instrument_token, tick);
    }
    if (!this.isDraining) {
      this.isDraining = true;
      void this.drain();
    }
  }

  async drain() {
    const ticks = Array.from(this.pendingTicks.values());
    this.pendingTicks.clear();

    for (const handler of this.tickHandlers) {
      try {
        await handler(ticks);
      } catch (error) {
        this.logger.error("tick handler failed", error);
      }
    }

    if (this.pendingTicks.size > 0) {
      await this.drain();
    } else {
      this.isDraining = false;
    }
  }

  handleOrderUpdate(update) {
    for (const handler of this.orderUpdateHandlers) {
      try {
        handler(update);
      } catch (error) {
        this.logger.error("order update handler failed", error);
      }
    }
  }

  handleDisconnect(error) {
    if (!this.isShuttingDown) {
      this.logger.error("kite ws disconnected unexpectedly", error);
    }
  }

  handleError(error) {
    this.logger.error("kite ws error", error);
  }

  handleNoReconnect() {
    this.logger.error("kite ws exhausted reconnect attempts");
  }
}
