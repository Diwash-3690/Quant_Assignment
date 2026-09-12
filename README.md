# qts

Quant trading system: live grid / stop-and-reverse execution, technical
analysis, macro regime engine, Zerodha Kite Connect integration, and
bar-accurate backtesting for MCX and NSE.

## Setup

Requires a running PostgreSQL instance.

1. Create the `qts_app` role and `qts` database (run once, connected as a
   superuser such as `postgres`, against the default `postgres`
   maintenance database — not `qts`, which doesn't exist yet):
   ```
   psql -U postgres -f db/setup-role-and-database.sql
   ```
   Edit the password in that file first, or run
   `ALTER ROLE qts_app WITH PASSWORD 'your-password';` afterwards.
2. Apply the schema migrations in `db/migrations/`, in order, against the
   `qts` database (no migration tool is wired up yet — run them by hand):
   ```
   psql -U qts_app -d qts -f db/migrations/0001_create_orders_table.sql
   psql -U qts_app -d qts -f db/migrations/0002_create_positions_table.sql
   ```

```
npm install
```

Copy `.env.example` to `.env`. `DATABASE_PASSWORD` must be exactly the
`qts_app` role's password from step 1 above — not a full connection
string, not another role's password. `BROKER_MODE` defaults to `mock`,
so no Kite credentials are required to run anything below; Kite env
vars are only validated when `BROKER_MODE=live`. Every entry script
(`run-dev.js`, `run-mock.js`, `run-live.js`, `authenticate.js`) loads
`.env` automatically via `dotenv/config` — no need to `export` variables
by hand.

## Running

- `npm run dev:api` — dashboard API/WebSocket server, reads positions and
  open orders from Postgres.
- `npm run dev:web` — Vite dev server for the dashboard UI, proxies
  `/api` and `/ws` to `dev:api`.
- `npm run check:db` — isolates database problems from the rest of the
  app: prints the resolved host/port/database/user (never the password)
  and whether a password was loaded from `.env` at all, then attempts one
  `SELECT`. Run this first whenever you see `28P01 password authentication
  failed` — it tells you immediately whether `.env` is being read and
  whether those exact credentials work against Postgres, without the
  grid engine or dashboard in the way.
- `npm run seed` — inserts one demo position and one demo open order
  directly into Postgres via the same repositories the app uses, so the
  dashboard has something to show immediately without waiting for
  `dev:mock` to place and fill a grid leg.
- `npm run dev:mock` — runs the grid engine end-to-end against
  `broker/mock/mock-broker.js`, a synthetic broker driven by
  `broker/mock/price-feed.js` (a seeded random walk, no external data
  vendor or Kite account needed). Fills flow through the same
  `OrderStateManager`/`PositionStateManager` code path live trading uses,
  and land in the same Postgres tables the dashboard reads — so
  `dev:api` + `dev:web` + `dev:mock` together give a fully working,
  credential-free demo of the whole stack. The dashboard's Positions and
  Orders tables stay empty until `dev:mock` places and fills its first
  grid legs — that's expected, not a bug.
- `npm run backtest` — bar-accurate backtest harness.

Switch to real trading later with `BROKER_MODE=live` plus
`KITE_API_KEY`/`KITE_API_SECRET`/`KITE_ACCESS_TOKEN`, and run
`scripts/run-live.js` instead of `scripts/run-mock.js` — both wire the
exact same `GridEngine`, so strategy behavior does not change between
mock and live, only which `BrokerInterface` implementation is behind it.

## Layout

```
src/
  config/         configuration loading
  domain/         instrument, order, position, signal models
  ta/             trend, momentum, volatility, volume indicators
  regime/         macro proxies, regime scoring, parameter overrides
  execution/      grid and stop-and-reverse engines
  broker/         broker interface and Kite Connect adapter
  state/          order/position state and reconciliation
  backtest/       bar-accurate backtest engine
  observability/  structured logging and alerting
```

Internal imports use Node's native subpath imports, aliased with the `#`
prefix (e.g. `import { Order } from "#domain/order.js"`), configured in
`package.json` under `imports` and mirrored in `jsconfig.json` for editor
resolution.

## Design decisions and known gaps

- **Money** is plain JS numbers in rupees, matching Kite Connect's own API
  convention, not integer paise or a decimal library. Precision is enforced
  by funneling every order price through `domain/money.js#roundToTick`
  (tick-size correctness) and every P&L/average-price calculation through
  `roundToPaisa` (currency precision) — two separate functions because they
  answer different questions.
- **Persistence** is PostgreSQL, for order state, position state, and
  eventually tick data. `execution/grid-engine.js` and
  `execution/sar-engine.js` do **not** persist their own state (grid legs,
  SAR direction/cycle, kill-switch flag) — only the orders and positions
  they produce are durable. A process restart currently loses in-flight
  grid/SAR shape even though the underlying orders/positions survive.
- **`placeOrder` is never automatically retried.** Kite has no
  idempotency-key mechanism at the API level, so blindly retrying a timed-out
  placement risks a duplicate live order. `state/order-state.js` writes
  intent to Postgres as `PENDING` *before* calling the broker, and
  `state/reconciliation.js` is what's allowed to actually retry — only
  after confirming via `fetchOrders()` that the broker never received the
  original attempt.
- **Kite's login/session flow is out of scope so far.** `KiteRestClient`
  expects to be handed an already-valid `accessToken`; the daily
  `request_token` → `access_token` exchange isn't built yet.
- **`ta/volume.js#vwap` is session-agnostic.** It accumulates over whatever
  bars it's given; resetting at the start of each trading session is the
  caller's responsibility, not baked into the function.
- **Stops in `SarEngine` only move on discrete events** (a pyramid add or a
  reversal), not continuously on every tick — trailing on every tick would
  mean constant order-modification calls against Kite's rate limits for
  marginal benefit.

## Test

```
npm test
```

