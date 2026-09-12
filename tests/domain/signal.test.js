import { describe, expect, it } from "vitest";
import { createSignal, SignalDirection } from "#domain/signal.js";
import { Exchange } from "#domain/instrument.js";

const validInput = {
  tradingSymbol: "CRUDEOIL25DECFUT",
  exchange: Exchange.MCX,
  direction: SignalDirection.LONG,
  strength: 0.8,
  source: "macro-regime-engine",
  generatedAt: "2026-09-11T09:15:00.000Z",
};

describe("createSignal", () => {
  it("returns a frozen signal for valid input", () => {
    const signal = createSignal(validInput);
    expect(signal.direction).toBe(SignalDirection.LONG);
    expect(Object.isFrozen(signal)).toBe(true);
  });

  it("rejects a strength outside 0 to 1", () => {
    expect(() => createSignal({ ...validInput, strength: 1.5 })).toThrow();
  });
});
