import { z } from "zod";
import { Exchange } from "#domain/instrument.js";

const positionSchema = z.object({
  tradingSymbol: z.string().min(1),
  exchange: z.nativeEnum(Exchange),
  netQuantity: z.number().int(),
  averagePrice: z.number().nonnegative(),
  realizedPnl: z.number(),
  unrealizedPnl: z.number(),
  updatedAt: z.string().datetime(),
});

export function createPosition(input) {
  return Object.freeze(positionSchema.parse(input));
}
