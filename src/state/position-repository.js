import { PositionRepository } from "#state/position-repository.js";

function toRow(position) {
  return {
    trading_symbol: position.tradingSymbol,
    exchange: position.exchange,
    net_quantity: position.netQuantity,
    average_price: position.averagePrice,
    realized_pnl: position.realizedPnl,
    unrealized_pnl: position.unrealizedPnl,
    updated_at: position.updatedAt,
  };
}

function toDomain(row) {
  return {
    tradingSymbol: row.trading_symbol,
    exchange: row.exchange,
    netQuantity: row.net_quantity,
    averagePrice: Number(row.average_price),
    realizedPnl: Number(row.realized_pnl),
    unrealizedPnl: Number(row.unrealized_pnl),
    updatedAt: row.updated_at,
  };
}

export class PostgresPositionRepository extends PositionRepository {
  constructor({ pool }) {
    super();
    this.pool = pool;
  }

  async find(tradingSymbol, exchange) {
    const result = await this.pool.query(
      "SELECT * FROM positions WHERE trading_symbol = $1 AND exchange = $2",
      [tradingSymbol, exchange],
    );
    return result.rows[0] ? toDomain(result.rows[0]) : null;
  }

  async upsert(position) {
    const row = toRow(position);
    await this.pool.query(
      `INSERT INTO positions (
        trading_symbol, exchange, net_quantity, average_price, realized_pnl, unrealized_pnl, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (trading_symbol, exchange) DO UPDATE SET
        net_quantity = EXCLUDED.net_quantity,
        average_price = EXCLUDED.average_price,
        realized_pnl = EXCLUDED.realized_pnl,
        unrealized_pnl = EXCLUDED.unrealized_pnl,
        updated_at = EXCLUDED.updated_at`,
      [
        row.trading_symbol,
        row.exchange,
        row.net_quantity,
        row.average_price,
        row.realized_pnl,
        row.unrealized_pnl,
        row.updated_at,
      ],
    );
  }

  async findAll() {
    const result = await this.pool.query("SELECT * FROM positions");
    return result.rows.map(toDomain);
  }
}
