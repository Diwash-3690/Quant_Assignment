import { useEffect, useState } from "react";
import "./App.css";

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
  const [snapshot, setSnapshot] = useState({ positions: [], orders: [], asOf: null });
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.addEventListener("open", () => setConnectionStatus("connected"));
    socket.addEventListener("close", () => setConnectionStatus("disconnected"));
    socket.addEventListener("error", () => setConnectionStatus("error"));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "snapshot") {
        setSnapshot(message.data);
      }
    });

    return () => socket.close();
  }, []);

  return { snapshot, connectionStatus };
}

function App() {
  const { snapshot, connectionStatus } = useSnapshot();

  return (
    <main id="dashboard">
      <header>
        <h1>QTS Dashboard</h1>
        <span className={`status status-${connectionStatus}`}>{connectionStatus}</span>
        {snapshot.asOf ? <span className="as-of">as of {snapshot.asOf}</span> : null}
      </header>

      <section>
        <h2>Positions</h2>
        <PositionsTable positions={snapshot.positions} />
      </section>

      <section>
        <h2>Open Orders</h2>
        <OrdersTable orders={snapshot.orders} />
      </section>
    </main>
  );
}

export default App;
