CREATE TABLE IF NOT EXISTS positions (
  trading_symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  net_quantity INTEGER NOT NULL DEFAULT 0,
  average_price NUMERIC NOT NULL DEFAULT 0,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (trading_symbol, exchange)
);
