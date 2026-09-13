import pg from "pg";
import "dotenv/config";
import { PostgresOrderRepository } from "#state/postgres/order-repository.js";
import { PostgresPositionRepository } from "#state/postgres/position-repository.js";

let cachedRepositories = null;

export async function getRepositories({
  createPool = (options) => new pg.Pool(options),
  env = process.env,
} = {}) {
  if (!cachedRepositories) {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("missing required environment variable: DATABASE_URL");
    }
    const pool = createPool({ connectionString: databaseUrl });
    cachedRepositories = {
      orderRepository: new PostgresOrderRepository({ pool }),
      positionRepository: new PostgresPositionRepository({ pool }),
    };
  }
  return cachedRepositories;
}

export function resetRepositoriesCacheForTests() {
  cachedRepositories = null;
}