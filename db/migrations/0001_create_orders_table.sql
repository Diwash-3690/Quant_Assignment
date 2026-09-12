CREATE TABLE IF NOT EXISTS orders (
  idempotency_key TEXT PRIMARY KEY,
  broker_order_id TEXT,
  trading_symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price NUMERIC,
  trigger_price NUMERIC,
  status TEXT NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_broker_order_id ON orders (broker_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
