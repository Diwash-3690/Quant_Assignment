import { describe, expect, it, vi } from "vitest";
import { loadSettings } from "#config/loader.js";

const validYaml = `
database:
  host: localhost
  port: 5432
  database: qts
  user: qts_app

broker:
  kite:
    timeoutMs: 10000
    ordersPerSecond: 3
    retryOptions:
      retries: 3
      minTimeoutMs: 500
      factor: 2

execution:
  grid:
    spacingMultiplier: 1
    legsPerSide: 2
    quantityPerLeg: 100
    maxPositionQuantityPerSide: 300
    maxLegsPerSide: 4
    maxDeviationSpacings: 3
    maxLossAmount: 25000
  sar:
    stopMultiplier: 2
    maxLossAmount: 25000
    maxPositionQuantity: 300
    maxPyramidLevels: 2
    pyramidStepMultiplier: 1
    quantityPerAdd: 100
    reversalQuantity: 100

backtest:
  costs:
    flatBrokerageFee: 20
    brokeragePercent: 0.0003
    statutoryChargeRate: 0.0005

instruments:
  - instrumentToken: 408065
    tradingSymbol: CRUDEOIL25DECFUT
    exchange: MCX
    segment: FUTURES
    lotSize: 100
    tickSize: 1
    expiry: "2025-12-19"
`;

const validEnv = {
  DATABASE_PASSWORD: "db-secret",
  BROKER_MODE: "live",
  KITE_API_KEY: "api-key",
  KITE_API_SECRET: "api-secret",
  KITE_ACCESS_TOKEN: "access-token",
};

describe("loadSettings", () => {
  it("loads, validates, and assembles a complete settings object", async () => {
    const readFile = vi.fn(async () => validYaml);

    const settings = await loadSettings("config/settings.yaml", { readFile, env: validEnv });

    expect(readFile).toHaveBeenCalledWith("config/settings.yaml", "utf8");
    expect(settings.database).toEqual({
      host: "localhost",
      port: 5432,
      database: "qts",
      user: "qts_app",
      password: "db-secret",
    });
    expect(settings.broker.kite).toMatchObject({
      timeoutMs: 10000,
      ordersPerSecond: 3,
      apiKey: "api-key",
      apiSecret: "api-secret",
      accessToken: "access-token",
    });
    expect(settings.execution.grid.maxPositionQuantityPerSide).toBe(300);
    expect(settings.execution.sar.maxPositionQuantity).toBe(300);
    expect(settings.backtest.costs.flatBrokerageFee).toBe(20);
  });

  it("validates and freezes each instrument via the domain factory", async () => {
    const readFile = vi.fn(async () => validYaml);
    const settings = await loadSettings("config/settings.yaml", { readFile, env: validEnv });

    expect(settings.instruments).toHaveLength(1);
    expect(settings.instruments[0].tradingSymbol).toBe("CRUDEOIL25DECFUT");
    expect(Object.isFrozen(settings.instruments[0])).toBe(true);
  });

  it("throws a clear error when a required config section is missing", async () => {
    const incomplete = validYaml.replace("spacingMultiplier: 1", "");
    const readFile = vi.fn(async () => incomplete);

    await expect(loadSettings("config/settings.yaml", { readFile, env: validEnv })).rejects.toThrow();
  });

  it("throws when a required environment secret is missing", async () => {
    const readFile = vi.fn(async () => validYaml);
    const incompleteEnv = { ...validEnv, KITE_ACCESS_TOKEN: undefined };

    await expect(loadSettings("config/settings.yaml", { readFile, env: incompleteEnv })).rejects.toThrow(
      "KITE_ACCESS_TOKEN",
    );
  });

  it("defaults to mock broker mode and does not require Kite credentials", async () => {
    const readFile = vi.fn(async () => validYaml);
    const mockEnv = { DATABASE_PASSWORD: "db-secret" };

    const settings = await loadSettings("config/settings.yaml", { readFile, env: mockEnv });

    expect(settings.broker.mode).toBe("mock");
    expect(settings.broker.kite.apiKey).toBeUndefined();
  });

  it("requires Kite credentials only when BROKER_MODE is live", async () => {
    const readFile = vi.fn(async () => validYaml);
    const liveEnvMissingSecret = { DATABASE_PASSWORD: "db-secret", BROKER_MODE: "live" };

    await expect(
      loadSettings("config/settings.yaml", { readFile, env: liveEnvMissingSecret }),
    ).rejects.toThrow("KITE_API_KEY");
  });

  it("throws when an instrument entry fails domain validation", async () => {
    const badInstrument = validYaml.replace("lotSize: 100", "lotSize: -100");
    const readFile = vi.fn(async () => badInstrument);

    await expect(loadSettings("config/settings.yaml", { readFile, env: validEnv })).rejects.toThrow();
  });
});
