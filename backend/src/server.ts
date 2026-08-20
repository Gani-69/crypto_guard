import "dotenv/config";
import http from "http";
import { createApp } from "./app";
import { attachWebSocketServer } from "./ws/server";
import { startCoinGeckoSync } from "./services/coingecko.service";

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
const server = http.createServer(app);

// WebSocket stub (Block A): live price ticks / risk-state pushes land here in later blocks.
attachWebSocketServer(server);

// Start live CoinGecko pricing sync job
startCoinGeckoSync();

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[cryptoguard] backend listening on :${PORT}`);
});
