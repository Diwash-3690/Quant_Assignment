import { afterEach, describe, expect, it, vi } from "vitest";
import { getRepositories, resetRepositoriesCacheForTests } from "#server/dashboard-repositories.js";

afterEach(() => {
  resetRepositoriesCacheForTests();
});

describe("getRepositories", () => {
  it("builds a pool straight from DATABASE_URL and constructs both repositories", async () => {
    const fakePool = { query: vi.fn() };
    const createPool = vi.fn(() => fakePool);
    const env = { DATABASE_URL: "postgresql://test" };

    const { orderRepository, positionRepository } = await getRepositories({ createPool, env });

    expect(createPool).toHaveBeenCalledWith({ connectionString: "postgresql://test" });
    expect(orderRepository.pool).toBe(fakePool);
    expect(positionRepository.pool).toBe(fakePool);
  });

  it("caches the repositories, never rebuilding the pool on later calls", async () => {
    const createPool = vi.fn(() => ({ query: vi.fn() }));
    const env = { DATABASE_URL: "postgresql://test" };

    const first = await getRepositories({ createPool, env });
    const second = await getRepositories({ createPool, env });

    expect(createPool).toHaveBeenCalledTimes(1);
    expect(second.orderRepository).toBe(first.orderRepository);
    expect(second.positionRepository).toBe(first.positionRepository);
  });

  it("throws a clear error when DATABASE_URL is missing, instead of failing inside pg", async () => {
    const createPool = vi.fn();

    await expect(getRepositories({ createPool, env: {} })).rejects.toThrow("DATABASE_URL");
    expect(createPool).not.toHaveBeenCalled();
  });
});