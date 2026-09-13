import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const JSON_HEADERS = { "Content-Type": "application/json" };

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(payload));
}

async function fetchSnapshot(positionRepository, orderRepository) {
  const [positions, orders] = await Promise.all([
    positionRepository.findAll(),
    orderRepository.findAllOpen(),
  ]);
  return { positions, orders, asOf: new Date().toISOString() };
}

function broadcastSnapshot(webSocketServer, snapshot) {
  const payload = JSON.stringify({ type: "snapshot", data: snapshot });
  for (const client of webSocketServer.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

export function createDashboardServer({
  positionRepository,
  orderRepository,
  logger,
  pollIntervalMs = 2000,
}) {
  const httpServer = createServer(async (request, response) => {
    try {
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "method not allowed" });
        return;
      }

      if (request.url === "/api/positions") {
        sendJson(response, 200, { positions: await positionRepository.findAll() });
        return;
      }

      if (request.url === "/api/orders") {
        sendJson(response, 200, { orders: await orderRepository.findAllOpen() });
        return;
      }

      sendJson(response, 404, { error: "not found" });
    } catch (error) {
      console.log("error", error)
      logger.error({ err: error }, "dashboard request failed");
      sendJson(response, 500, { error: "internal server error" });
    }
  });

  const webSocketServer = new WebSocketServer({ server: httpServer, path: "/ws" });
  let pollTimer = null;

  webSocketServer.on("connection", (socket) => {
    fetchSnapshot(positionRepository, orderRepository)
      .then((snapshot) => socket.send(JSON.stringify({ type: "snapshot", data: snapshot })))
      .catch((error) => logger.error({ err: error }, "failed to send initial snapshot"));
  });

  async function poll() {
    try {
      const snapshot = await fetchSnapshot(positionRepository, orderRepository);
      broadcastSnapshot(webSocketServer, snapshot);
    } catch (error) {
      logger.error({ err: error }, "dashboard poll failed");
    }
  }

  return {
    listen(port) {
      return new Promise((resolve) => {
        httpServer.listen(port, () => {
          pollTimer = setInterval(poll, pollIntervalMs);
          logger.info({ port: httpServer.address().port }, "dashboard server listening");
          resolve(httpServer.address());
        });
      });
    },
    address() {
      return httpServer.address();
    },
    close() {
      return new Promise((resolve, reject) => {
        clearInterval(pollTimer);
        webSocketServer.close();
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
