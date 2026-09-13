# qts

Quant trading system: live grid / stop-and-reverse execution, technical
analysis, macro regime engine, Zerodha Kite Connect integration, and
bar-accurate backtesting for MCX and NSE.

## Setup
i. Install all the Packages: `npm i`
ii. Run Mock Data on separate terminal: `npm run dev:mock`
iii. Copy Env Variables: `cp .env.example .env`
iv. Change your `DATABASE_URL` to your url
v. Insert ``` bash
KITE_API_KEY=
KITE_API_SECRET=
KITE_ACCESS_TOKEN=
```
(If you've one)
vi. Run `npm run backtest` bar accurate backtest harness
vii. Run: `npm run seed`
viii. Run Our Nextjs Server: `npm run dev`
ix. Test Our Services: `npm run test`


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

# Thank you.

