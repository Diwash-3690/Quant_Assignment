"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 2000;

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function PositionsTable({ positions }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Exchange</th>
          <th>Net Qty</th>
          <th>Avg Price</th>
          <th>Realized P&amp;L</th>
          <th>Unrealized P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr key={`${position.tradingSymbol}-${position.exchange}`}>
            <td>{position.tradingSymbol}</td>
            <td>{position.exchange}</td>
            <td>{position.netQuantity}</td>
            <td>{formatCurrency(position.averagePrice)}</td>
            <td>{formatCurrency(position.realizedPnl)}</td>
            <td>{formatCurrency(position.unrealizedPnl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrdersTable({ orders }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Side</th>
          <th>Type</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.idempotencyKey}>
            <td>{order.tradingSymbol}</td>
            <td>{order.side}</td>
            <td>{order.orderType}</td>
            <td>{order.quantity}</td>
            <td>{order.price === null ? "—" : formatCurrency(order.price)}</td>
            <td>{order.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useSnapshot() {
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [asOf, setAsOf] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [positionsResponse, ordersResponse] = await Promise.all([
          fetch("/api/positions"),
          fetch("/api/orders"),
        ]);
        if (!positionsResponse.ok || !ordersResponse.ok) {
          throw new Error("request failed");
        }
        const positionsBody = await positionsResponse.json();
        const ordersBody = await ordersResponse.json();
        if (cancelled) {
          return;
        }
        setPositions(positionsBody.positions);
        setOrders(ordersBody.orders);
        setAsOf(new Date().toISOString());
        setConnectionStatus("connected");
      } catch {
        if (!cancelled) {
          setConnectionStatus("error");
        }
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { positions, orders, asOf, connectionStatus };
}

export default function DashboardPage() {
  const { positions, orders, asOf, connectionStatus } = useSnapshot();

  return (
    <main id="dashboard">
      <header>
        <h1>QTS Dashboard</h1>
        <span className={`status status-${connectionStatus}`}>{connectionStatus}</span>
        {asOf ? <span className="as-of">as of {asOf}</span> : null}
      </header>

      <section>
        <h2>Positions</h2>
        <PositionsTable positions={positions} />
      </section>

      <section>
        <h2>Open Orders</h2>
        <OrdersTable orders={orders} />
      </section>
    </main>
  );
}
