import "dotenv/config";
import pg from "pg";
import { loadSettings } from "#config/loader.js";
import { PostgresOrderRepository } from "#state/postgres/order-repository.js";
import { PostgresPositionRepository } from "#state/postgres/position-repository.js";
import { createLogger } from "#observability/logging.js";
import { createDashboardServer } from "#server/dashboard-server.js";

async function main() {
  const settings = await loadSettings("config/settings.yaml");
  const logger = createLogger({ service: "dashboard-server" });

  const pool = new pg.Pool({
    host: settings.database.host,
    port: settings.database.port,
    database: settings.database.database,
    user: settings.database.user,
    password: settings.database.password,
  });

  const positionRepository = new PostgresPositionRepository({ pool });
  const orderRepository = new PostgresOrderRepository({ pool });

  const server = createDashboardServer({ positionRepository, orderRepository, logger });
  const port = Number(process.env.DASHBOARD_PORT ?? 4000);
  await server.listen(port);

  async function shutdown(signal) {
    logger.info({ signal }, "shutting down dashboard server");
    await server.close();
    await pool.end();
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
