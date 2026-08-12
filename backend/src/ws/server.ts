import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

/**
 * WebSocket stub — Block A.
 *
 * Real usage lands in later blocks:
 *  - Block B: broadcast live-ish market price ticks to subscribed clients.
 *  - Block D/E: push risk-state / session-state changes (e.g. NORMAL -> STEP_UP)
 *    so the frontend can react without polling.
 *
 * For now this just accepts connections on /ws and echoes a hello frame,
 * so the frontend (Block B) has something real to connect against.
 */
export function attachWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: "hello", message: "cryptoguard ws connected" }));

    socket.on("message", (raw) => {
      // Placeholder echo; replaced by real channel routing (market, risk) in later blocks.
      socket.send(JSON.stringify({ type: "echo", data: raw.toString() }));
    });
  });

  return wss;
}

/** Broadcast helper for later blocks (market ticks, risk-state pushes). */
export function broadcast(wss: WebSocketServer, payload: unknown): void {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
