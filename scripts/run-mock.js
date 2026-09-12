import "dotenv/config";
import pg from "pg";
import { loadSettings } from "#config/loader.js";
import { PostgresOrderRepository } from "#state/postgres/order-repository.js";
import { PostgresPositionRepository } from "#state/postgres/position-repository.js";
import { OrderStateManager } from "#state/order-state.js";
import { PositionStateManager, markToMarket } from "#state/position-state.js";
import { OrderReconciler } from "#state/reconciliation.js";
import { MockPriceFeed } from "#broker/mock/price-feed.js";
import { MockBroker } from "#broker/mock/mock-broker.js";
import { GridEngine } from "#execution/grid-engine.js";
import { createLogger } from "#observability/logging.js";
import { AlertDispatcher, WebhookAlertChannel } from "#observability/alerts.js";

function isEntryKey(idempotencyKey) {
  return idempotencyKey.includes("-entry-");
}

function isExitKey(idempotencyKey) {
  return idempotencyKey.includes("-exit-");
}

async function main() {
  const settings = await loadSettings("config/settings.yaml");
  const instrument = settings.instruments[0];
  if (!instrument) {
    throw new Error("no instrument configured in settings.yaml");
  }

  const initialReferencePrice = Number(process.env.GRID_INITIAL_REFERENCE_PRICE ?? 6500);
  const initialAtr = Number(process.env.GRID_INITIAL_ATR ?? 25);
  const tickIntervalMs = Number(process.env.MOCK_TICK_INTERVAL_MS ?? 1000);
  const priceVolatility = Number(process.env.MOCK_PRICE_VOLATILITY ?? 0.0015);
  const priceSeed = Number(process.env.MOCK_PRICE_SEED ?? 1);

  const logger = createLogger({ service: "qts-mock" });

  const alertChannels = process.env.ALERT_WEBHOOK_URL
    ? [new WebhookAlertChannel({ webhookUrl: process.env.ALERT_WEBHOOK_URL })]
    : [];
  const alertDispatcher = new AlertDispatcher({ channels: alertChannels, logger });

  const pool = new pg.Pool({
    host: settings.database.host,
    port: settings.database.port,
    database: settings.database.database,
    user: settings.database.user,
    password: settings.database.password,
  });

  const priceFeed = new MockPriceFeed({
    instrumentToken: instrument.instrumentToken,
    startPrice: initialReferencePrice,
    tickSize: instrument.tickSize,
    volatility: priceVolatility,
    seed: priceSeed,
  });
  const broker = new MockBroker({ priceFeed, tickSize: instrument.tickSize, logger });

  const orderRepository = new PostgresOrderRepository({ pool });
  const positionRepository = new PostgresPositionRepository({ pool });

  const orderStateManager = new OrderStateManager({ broker, repository: orderRepository });
  const positionStateManager = new PositionStateManager({ repository: positionRepository });
  const reconciler = new OrderReconciler({
    broker,
    orderStateManager,
    repository: orderRepository,
    logger,
  });

  const gridEngine = new GridEngine({
    tradingSymbol: instrument.tradingSymbol,
    exchange: instrument.exchange,
    tickSize: instrument.tickSize,
    orderStateManager,
    config: settings.execution.grid,
    logger,
    alertDispatcher,
  });

  await broker.connect();

  logger.info("reconciling orders from any prior session before starting the grid");
  const reconciliation = await reconciler.reconcile();
  logger.info({ reconciliation }, "reconciliation complete");

  gridEngine.start(initialReferencePrice, initialAtr);
  logger.info(
    { tradingSymbol: instrument.tradingSymbol, initialReferencePrice, initialAtr },
    "grid engine started against mock broker",
  );

  broker.subscribeTicks([instrument.instrumentToken], async (ticks) => {
    const tick = ticks.find((t) => t.instrument_token === instrument.instrumentToken);
    if (!tick) {
      return;
    }

    const currentPosition = await positionRepository.find(instrument.tradingSymbol, instrument.exchange);
    const realizedPnl = currentPosition?.realizedPnl ?? 0;
    const unrealizedPnl = currentPosition
      ? markToMarket(currentPosition, tick.last_price, new Date().toISOString()).unrealizedPnl
      : 0;

    await gridEngine.onTick({ lastPrice: tick.last_price, realizedPnl, unrealizedPnl });
  });

  broker.onOrderUpdate(async (update) => {
    const idempotencyKey = update.tag;
    if (!idempotencyKey || update.status !== "COMPLETE") {
      return;
    }

    await positionStateManager.applyFill(instrument.tradingSymbol, instrument.exchange, {
      side: update.transaction_type,
      quantity: update.quantity,
      price: update.average_price,
      filledAt: new Date().toISOString(),
    });

    if (isEntryKey(idempotencyKey)) {
      await gridEngine.onEntryFilled(idempotencyKey);
    } else if (isExitKey(idempotencyKey)) {
      await gridEngine.onExitFilled(idempotencyKey, update.average_price);
    }
  });

  priceFeed.start(tickIntervalMs);

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.warn({ signal }, "shutting down");
    await broker.disconnect();
    await pool.end();
    process.exit(0);
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("mock run failed to start:", error);
  process.exitCode = 1;
});
