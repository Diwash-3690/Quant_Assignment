import { afterEach, describe, expect, it, vi } from "vitest";
import { getRepositories, resetRepositoriesCacheForTests } from "#server/dashboard-repositories.js";

afterEach(() => {
  resetRepositoriesCacheForTests();
});

describe("getRepositories", () => {
  it("loads settings, builds a pool from the connection string, and constructs both repositories", async () => {
    const loadSettingsFn = vi.fn(async () => ({ database: { url: "postgresql://test" } }));
    const fakePool = { query: vi.fn() };
    const createPool = vi.fn(() => fakePool);

    const { orderRepository, positionRepository } = await getRepositories({
      loadSettingsFn,
      createPool,
    });

    expect(loadSettingsFn).toHaveBeenCalledWith("config/settings.yaml");
    expect(createPool).toHaveBeenCalledWith({ connectionString: "postgresql://test" });
    expect(orderRepository.pool).toBe(fakePool);
    expect(positionRepository.pool).toBe(fakePool);
  });

  it("caches the repositories, never reloading settings or rebuilding the pool on later calls", async () => {
    const loadSettingsFn = vi.fn(async () => ({ database: { url: "postgresql://test" } }));
    const createPool = vi.fn(() => ({ query: vi.fn() }));

    const first = await getRepositories({ loadSettingsFn, createPool });
    const second = await getRepositories({ loadSettingsFn, createPool });

    expect(loadSettingsFn).toHaveBeenCalledTimes(1);
    expect(createPool).toHaveBeenCalledTimes(1);
    expect(second.orderRepository).toBe(first.orderRepository);
    expect(second.positionRepository).toBe(first.positionRepository);
  });
});
