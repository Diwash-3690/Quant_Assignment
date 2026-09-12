import { describe, expect, it } from "vitest";
import { createPosition } from "#domain/position.js";
import { Exchange } from "#domain/instrument.js";

const validInput = {
  tradingSymbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  netQuantity: -100,
  averagePrice: 6250.5,
  realizedPnl: -1250,
  unrealizedPnl: 340,
  updatedAt: "2026-09-11T09:15:00.000Z",
};

describe("createPosition", () => {
  it("returns a frozen position for valid input, short quantity included", () => {
    const position = createPosition(validInput);
    expect(position.netQuantity).toBe(-100);
    expect(Object.isFrozen(position)).toBe(true);
  });

  it("rejects a negative average price", () => {
    expect(() => createPosition({ ...validInput, averagePrice: -1 })).toThrow();
  });
});
