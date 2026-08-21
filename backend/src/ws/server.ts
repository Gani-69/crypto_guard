import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "../db/prisma";

/**
 * WebSocket server — upgraded to broadcast live price ticks.
 *
 * Messages emitted:
 *  - { type: "hello" }                     — on connect
 *  - { type: "price_tick", prices: [...] } — every 3s: all coin prices with ±0.15% random walk
 *  - { type: "heartbeat" }                 — every 10s liveness ping
 */
export function attachWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Cache coin list to avoid hitting DB on every tick
  let coinCache: Array<{ symbol: string; priceUsd: number }> = [];
  let lastCacheRefresh = 0;
  const CACHE_TTL_MS = 60_000; // refresh from DB every 60s

  async function refreshCoinCache() {
    try {
      const coins = await prisma.coin.findMany({
        select: { symbol: true, priceUsd: true },
      });
      coinCache = coins;
      lastCacheRefresh = Date.now();
    } catch {
      // Silently continue with stale cache
    }
  }

  // Initial load
  refreshCoinCache();

  // Price tick interval: 3 seconds
  const tickInterval = setInterval(async () => {
    if (wss.clients.size === 0) return;

    // Refresh cache periodically
    if (Date.now() - lastCacheRefresh > CACHE_TTL_MS) {
      await refreshCoinCache();
    }

    // Apply random walk (±0.15%) to each coin
    const prices = coinCache.map((coin) => ({
      symbol: coin.symbol,
      price: coin.priceUsd * (1 + (Math.random() - 0.5) * 0.003),
    }));

    broadcast(wss, { type: "price_tick", prices });
  }, 3000);

  // Heartbeat interval: 10 seconds
  const heartbeatInterval = setInterval(() => {
    if (wss.clients.size === 0) return;
    broadcast(wss, { type: "heartbeat", ts: Date.now() });
  }, 10_000);

  wss.on("connection", (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: "hello", message: "cryptoguard ws connected" }));

    socket.on("message", (raw) => {
      // Placeholder echo; replaced by real channel routing in later blocks.
      socket.send(JSON.stringify({ type: "echo", data: raw.toString() }));
    });
  });

  wss.on("close", () => {
    clearInterval(tickInterval);
    clearInterval(heartbeatInterval);
  });

  return wss;
}

/** Broadcast helper — sends to all connected OPEN clients. */
export function broadcast(wss: WebSocketServer, payload: unknown): void {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
