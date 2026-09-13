import pg from "pg";
import { loadSettings } from "#config/loader.js";
import { PostgresOrderRepository } from "#state/postgres/order-repository.js";
import { PostgresPositionRepository } from "#state/postgres/position-repository.js";

let cachedRepositories = null;

export async function getRepositories({ loadSettingsFn = loadSettings, createPool = (options) => new pg.Pool(options) } = {}) {
  if (!cachedRepositories) {
    const settings = await loadSettingsFn("config/settings.yaml");
    const pool = createPool({ connectionString: settings.database.url });
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
