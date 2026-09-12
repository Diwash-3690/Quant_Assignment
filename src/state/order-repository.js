import { OrderStatus } from "#domain/order.js";

const OPEN_STATUSES = [OrderStatus.PENDING, OrderStatus.OPEN];
export class OrderRepository {
  async save(order) {
    throw new Error("save() not implemented");
  }

  async findByIdempotencyKey(idempotencyKey) {
    throw new Error("findByIdempotencyKey() not implemented");
  }

  async findByBrokerOrderId(brokerOrderId) {
    throw new Error("findByBrokerOrderId() not implemented");
  }

  async update(idempotencyKey, changes) {
    throw new Error("update() not implemented");
  }

  async findAllOpen() {
    throw new Error("findAllOpen() not implemented");
  }
}
function toRow(order) {
  return {
    idempotency_key: order.idempotencyKey,
    broker_order_id: order.brokerOrderId ?? null,
    trading_symbol: order.tradingSymbol,
    exchange: order.exchange,
    side: order.side,
    order_type: order.orderType,
    quantity: order.quantity,
    price: order.price ?? null,
    trigger_price: order.triggerPrice ?? null,
    status: order.status,
    placed_at: order.placedAt,
    updated_at: order.updatedAt,
  };
}

function toDomain(row) {
  return {
    idempotencyKey: row.idempotency_key,
    brokerOrderId: row.broker_order_id,
    tradingSymbol: row.trading_symbol,
    exchange: row.exchange,
    side: row.side,
    orderType: row.order_type,
    quantity: row.quantity,
    price: row.price === null ? null : Number(row.price),
    triggerPrice: row.trigger_price === null ? null : Number(row.trigger_price),
    status: row.status,
    placedAt: row.placed_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresOrderRepository extends OrderRepository {
  constructor({ pool }) {
    super();
    this.pool = pool;
  }

  async save(order) {
    const row = toRow(order);
    await this.pool.query(
      `INSERT INTO orders (
        idempotency_key, broker_order_id, trading_symbol, exchange, side,
        order_type, quantity, price, trigger_price, status, placed_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        row.idempotency_key,
        row.broker_order_id,
        row.trading_symbol,
        row.exchange,
        row.side,
        row.order_type,
        row.quantity,
        row.price,
        row.trigger_price,
        row.status,
        row.placed_at,
        row.updated_at,
      ],
    );
  }

  async findByIdempotencyKey(idempotencyKey) {
    const result = await this.pool.query("SELECT * FROM orders WHERE idempotency_key = $1", [
      idempotencyKey,
    ]);
    return result.rows[0] ? toDomain(result.rows[0]) : null;
  }

  async findByBrokerOrderId(brokerOrderId) {
    const result = await this.pool.query("SELECT * FROM orders WHERE broker_order_id = $1", [
      brokerOrderId,
    ]);
    return result.rows[0] ? toDomain(result.rows[0]) : null;
  }

  async update(idempotencyKey, changes) {
    await this.pool.query(
      `UPDATE orders SET
        broker_order_id = COALESCE($2, broker_order_id),
        status = COALESCE($3, status),
        updated_at = $4
      WHERE idempotency_key = $1`,
      [idempotencyKey, changes.brokerOrderId ?? null, changes.status ?? null, changes.updatedAt],
    );
  }

  async findAllOpen() {
    const result = await this.pool.query("SELECT * FROM orders WHERE status = ANY($1::text[])", [
      OPEN_STATUSES,
    ]);
    return result.rows.map(toDomain);
  }
}
