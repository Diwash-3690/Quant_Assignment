import "dotenv/config";
import pg from "pg";
import { loadSettings } from "#config/loader.js";
import { PostgresOrderRepository } from "#state/postgres/order-repository.js";
import { PostgresPositionRepository } from "#state/postgres/position-repository.js";
import { createOrder, OrderSide, OrderStatus, OrderType } from "#domain/order.js";
import { createPosition } from "#domain/position.js";

async function main() {
  const settings = await loadSettings("config/settings.yaml");
  const instrument = settings.instruments[0];
  if (!instrument) {
    throw new Error("no instrument configured in settings.yaml");
  }

  const pool = new pg.Pool({
    connectionString: settings.database.url,
  });

  const orderRepository = new PostgresOrderRepository({ pool });
  const positionRepository = new PostgresPositionRepository({ pool });
  const now = new Date().toISOString();

  const seedPosition = createPosition({
    tradingSymbol: instrument.tradingSymbol,
    exchange: instrument.exchange,
    netQuantity: 100,
    averagePrice: 6500,
    realizedPnl: 0,
    unrealizedPnl: 250,
    updatedAt: now,
  });
  await positionRepository.upsert(seedPosition);

  const seedOrder = createOrder({
    idempotencyKey: "seed-demo-order-1",
    brokerOrderId: null,
    tradingSymbol: instrument.tradingSymbol,
    exchange: instrument.exchange,
    side: OrderSide.BUY,
    orderType: OrderType.LIMIT,
    quantity: 100,
    price: 6480,
    triggerPrice: null,
    status: OrderStatus.OPEN,
    placedAt: now,
    updatedAt: now,
  });
  await orderRepository.save(seedOrder);

  console.log("seed data inserted:");
  console.log({ position: seedPosition, order: seedOrder });

  await pool.end();
}

main().catch((error) => {
  console.error("seeding failed:", error);
  process.exitCode = 1;
});
