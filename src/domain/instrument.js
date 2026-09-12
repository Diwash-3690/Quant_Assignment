import { z } from "zod";

export const Exchange = Object.freeze({
  NSE: "NSE",
  MCX: "MCX",
});

export const Segment = Object.freeze({
  EQUITY: "EQUITY",
  FUTURES: "FUTURES",
  OPTIONS: "OPTIONS",
});

const instrumentSchema = z.object({
  instrumentToken: z.number().int().positive(),
  tradingSymbol: z.string().min(1),
  exchange: z.nativeEnum(Exchange),
  segment: z.nativeEnum(Segment),
  lotSize: z.number().int().positive(),
  tickSize: z.number().positive(),
  expiry: z.string().date().nullable(),
});

export function createInstrument(input) {
  return Object.freeze(instrumentSchema.parse(input));
}
