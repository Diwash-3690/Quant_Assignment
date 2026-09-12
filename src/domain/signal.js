import { z } from "zod";
import { Exchange } from "#domain/instrument.js";

export const SignalDirection = Object.freeze({
  LONG: "LONG",
  SHORT: "SHORT",
  FLAT: "FLAT",
});

const signalSchema = z.object({
  tradingSymbol: z.string().min(1),
  exchange: z.nativeEnum(Exchange),
  direction: z.nativeEnum(SignalDirection),
  strength: z.number().min(0).max(1),
  source: z.string().min(1),
  generatedAt: z.string().datetime(),
});

export function createSignal(input) {
  return Object.freeze(signalSchema.parse(input));
}
