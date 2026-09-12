import { z } from "zod";
import { Exchange } from "#domain/instrument.js";

export const OrderSide = Object.freeze({
  BUY: "BUY",
  SELL: "SELL",
});

export const OrderType = Object.freeze({
  MARKET: "MARKET",
  LIMIT: "LIMIT",
  SL: "SL",
  SL_M: "SL_M",
});

export const OrderStatus = Object.freeze({
  PENDING: "PENDING",
  OPEN: "OPEN",
  COMPLETE: "COMPLETE",
  CANCELLED: "CANCELLED",
  REJECTED: "REJECTED",
});

const orderSchema = z.object({
  idempotencyKey: z.string().min(1),
  brokerOrderId: z.string().nullable(),
  tradingSymbol: z.string().min(1),
  exchange: z.nativeEnum(Exchange),
  side: z.nativeEnum(OrderSide),
  orderType: z.nativeEnum(OrderType),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative().nullable(),
  triggerPrice: z.number().nonnegative().nullable(),
  status: z.nativeEnum(OrderStatus),
  placedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export function createOrder(input) {
  return Object.freeze(orderSchema.parse(input));
}
