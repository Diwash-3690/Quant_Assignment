import { readFile as defaultReadFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import { createInstrument } from "#domain/instrument.js";

const retryOptionsSchema = z.object({
  retries: z.number().int().nonnegative(),
  minTimeoutMs: z.number().int().positive(),
  factor: z.number().positive(),
});

const kiteConfigSchema = z.object({
  timeoutMs: z.number().int().positive(),
  ordersPerSecond: z.number().positive(),
  retryOptions: retryOptionsSchema,
});

const gridConfigSchema = z.object({
  spacingMultiplier: z.number().positive(),
  legsPerSide: z.number().int().positive(),
  quantityPerLeg: z.number().int().positive(),
  maxPositionQuantityPerSide: z.number().int().positive(),
  maxLegsPerSide: z.number().int().positive(),
  maxDeviationSpacings: z.number().positive(),
  maxLossAmount: z.number().positive(),
});

const sarConfigSchema = z.object({
  stopMultiplier: z.number().positive(),
  maxLossAmount: z.number().positive(),
  maxPositionQuantity: z.number().int().positive(),
  maxPyramidLevels: z.number().int().nonnegative(),
  pyramidStepMultiplier: z.number().positive(),
  quantityPerAdd: z.number().int().positive(),
  reversalQuantity: z.number().int().positive(),
});

const backtestCostsConfigSchema = z.object({
  flatBrokerageFee: z.number().nonnegative(),
  brokeragePercent: z.number().nonnegative(),
  statutoryChargeRate: z.number().nonnegative(),
});

const settingsFileSchema = z.object({
  broker: z.object({ kite: kiteConfigSchema }),
  execution: z.object({ grid: gridConfigSchema, sar: sarConfigSchema }),
  backtest: z.object({ costs: backtestCostsConfigSchema }),
  instruments: z.array(z.unknown()).default([]),
});

function requireEnv(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

export async function loadSettings(path, { readFile = defaultReadFile, env = process.env } = {}) {
  const raw = await readFile(path, "utf8");
  const parsed = parse(raw);
  const settings = settingsFileSchema.parse(parsed);
  const brokerMode = env.BROKER_MODE === "live" ? "live" : "mock";

  return {
    database: { url: requireEnv(env, "DATABASE_URL") },
    broker: {
      mode: brokerMode,
      kite:
        brokerMode === "live"
          ? {
              ...settings.broker.kite,
              apiKey: requireEnv(env, "KITE_API_KEY"),
              apiSecret: requireEnv(env, "KITE_API_SECRET"),
              accessToken: requireEnv(env, "KITE_ACCESS_TOKEN"),
            }
          : settings.broker.kite,
    },
    execution: settings.execution,
    backtest: settings.backtest,
    instruments: settings.instruments.map(createInstrument),
  };
}
