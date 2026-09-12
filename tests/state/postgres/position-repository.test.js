import { describe, expect, it, vi } from "vitest";
import { PostgresPositionRepository } from "#state/postgres/position-repository.js";
import { Exchange } from "#domain/instrument.js";

function createFakePool(queryResult = { rows: [] }) {
  return {
    query: vi.fn(async () => queryResult),
  };
}

const samplePosition = {
  tradingSymbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  netQuantity: -50,
  averagePrice: 6300,
  realizedPnl: 4950,
  unrealizedPnl: 2000,
  updatedAt: "2026-09-11T09:15:00.000Z",
};

const sampleRow = {
  trading_symbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  net_quantity: -50,
  average_price: "6300.00",
  realized_pnl: "4950.00",
  unrealized_pnl: "2000.00",
  updated_at: "2026-09-11T09:15:00.000Z",
};

describe("PostgresPositionRepository", () => {
  it("maps a found row back to the domain shape", async () => {
    const pool = createFakePool({ rows: [sampleRow] });
    const repository = new PostgresPositionRepository({ pool });

    const position = await repository.find("CRUDEOIL25DECFUT", Exchange.MCX);

    expect(position).toEqual(samplePosition);
  });

  it("returns null when no position exists yet", async () => {
    const pool = createFakePool({ rows: [] });
    const repository = new PostgresPositionRepository({ pool });

    expect(await repository.find("CRUDEOIL25DECFUT", Exchange.MCX)).toBeNull();
  });

  it("upserts with an on-conflict update clause", async () => {
    const pool = createFakePool();
    const repository = new PostgresPositionRepository({ pool });

    await repository.upsert(samplePosition);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (trading_symbol, exchange) DO UPDATE SET"),
      [
        "CRUDEOIL25DECFUT",
        Exchange.MCX,
        -50,
        6300,
        4950,
        2000,
        "2026-09-11T09:15:00.000Z",
      ],
    );
  });
});
