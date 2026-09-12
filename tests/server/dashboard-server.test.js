import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { createDashboardServer } from "#server/dashboard-server.js";

function createFakeRepositories({ positions = [], orders = [] } = {}) {
  return {
    positionRepository: { findAll: async () => positions },
    orderRepository: { findAllOpen: async () => orders },
  };
}

function createSilentLogger() {
  return { info: () => {}, error: () => {} };
}

describe("dashboard-server", () => {
  let server;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("returns positions from the repository over HTTP", async () => {
    const positions = [
      {
        tradingSymbol: "CRUDEOIL25DECFUT",
        exchange: "MCX",
        netQuantity: 100,
        averagePrice: 6500,
        realizedPnl: 0,
        unrealizedPnl: 250,
        updatedAt: "2026-09-12T00:00:00.000Z",
      },
    ];
    const { positionRepository, orderRepository } = createFakeRepositories({ positions });
    server = createDashboardServer({
      positionRepository,
      orderRepository,
      logger: createSilentLogger(),
    });
    const { port } = await server.listen(0);

    const response = await fetch(`http://localhost:${port}/api/positions`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.positions).toEqual(positions);
  });

  it("returns 404 for unknown routes", async () => {
    const { positionRepository, orderRepository } = createFakeRepositories();
    server = createDashboardServer({
      positionRepository,
      orderRepository,
      logger: createSilentLogger(),
    });
    const { port } = await server.listen(0);

    const response = await fetch(`http://localhost:${port}/unknown`);
    expect(response.status).toBe(404);
  });

  it("rejects non-GET requests", async () => {
    const { positionRepository, orderRepository } = createFakeRepositories();
    server = createDashboardServer({
      positionRepository,
      orderRepository,
      logger: createSilentLogger(),
    });
    const { port } = await server.listen(0);

    const response = await fetch(`http://localhost:${port}/api/positions`, { method: "POST" });
    expect(response.status).toBe(405);
  });

  it("pushes an initial snapshot to newly connected WebSocket clients", async () => {
    const orders = [
      {
        idempotencyKey: "grid-entry-1",
        tradingSymbol: "CRUDEOIL25DECFUT",
        exchange: "MCX",
        side: "BUY",
        orderType: "LIMIT",
        quantity: 100,
        price: 6500,
        status: "OPEN",
      },
    ];
    const { positionRepository, orderRepository } = createFakeRepositories({ orders });
    server = createDashboardServer({
      positionRepository,
      orderRepository,
      logger: createSilentLogger(),
      pollIntervalMs: 50,
    });
    const { port } = await server.listen(0);

    const message = await new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://localhost:${port}/ws`);
      socket.on("message", (data) => {
        socket.close();
        resolve(JSON.parse(data.toString()));
      });
      socket.on("error", reject);
    });

    expect(message.type).toBe("snapshot");
    expect(message.data.orders).toEqual(orders);
  });
});
