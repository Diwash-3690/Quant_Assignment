import { describe, expect, it } from "vitest";
import { createInstrument, Exchange, Segment } from "#domain/instrument.js";

const validInput = {
  instrumentToken: 408065,
  tradingSymbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  segment: Segment.FUTURES,
  lotSize: 100,
  tickSize: 1,
  expiry: "2025-12-19",
};

describe("createInstrument", () => {
  it("returns a frozen instrument for valid input", () => {
    const instrument = createInstrument(validInput);
    expect(instrument.tradingSymbol).toBe("CRUDEOIL25DECFUT");
    expect(Object.isFrozen(instrument)).toBe(true);
  });

  it("rejects a non-positive lot size", () => {
    expect(() => createInstrument({ ...validInput, lotSize: 0 })).toThrow();
  });

  it("rejects an unknown exchange", () => {
    expect(() => createInstrument({ ...validInput, exchange: "BSE" })).toThrow();
  });
});
