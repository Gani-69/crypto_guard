import { prisma } from "../db/prisma";

const COINGECKO_IDS = [
  "bitcoin", "ethereum", "binancecoin", "solana", "ripple",
  "cardano", "dogecoin", "avalanche-2", "polkadot", "matic-network",
  "chainlink", "uniswap", "cosmos", "litecoin", "filecoin",
  "near", "aptos", "arbitrum", "optimism", "sui"
].join(",");

export async function syncLivePrices() {
  try {
    console.log("[coingecko] Fetching live market prices...");
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINGECKO_IDS}`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      console.warn(`[coingecko] API returned status ${res.status}. Rate-limited? Keeping cached rates.`);
      return;
    }

    const cgCoins = await res.json() as any[];
    if (!Array.isArray(cgCoins)) {
      console.warn("[coingecko] Invalid API response format. Keeping cached rates.");
      return;
    }

    for (const cgCoin of cgCoins) {
      const symbol = cgCoin.symbol.toUpperCase();
      const dbCoin = await prisma.coin.findUnique({ where: { symbol } });
      if (dbCoin) {
        // Parse and update 7d history
        let priceHistory = [];
        try {
          priceHistory = dbCoin.priceHistory7d ? JSON.parse(dbCoin.priceHistory7d) : [];
        } catch (e) {
          priceHistory = [];
        }

        // Add new price point
        const newPoint = { timestamp: Date.now(), price: cgCoin.current_price };
        priceHistory.push(newPoint);

        // Keep last 200 points
        if (priceHistory.length > 200) {
          priceHistory = priceHistory.slice(-200);
        }

        await prisma.coin.update({
          where: { symbol },
          data: {
            priceUsd: cgCoin.current_price,
            marketCapUsd: cgCoin.market_cap,
            volume24hUsd: cgCoin.total_volume,
            change24hPct: cgCoin.price_change_percentage_24h ?? 0,
            rank: cgCoin.market_cap_rank,
            logoUrl: cgCoin.image,
            priceHistory7d: JSON.stringify(priceHistory),
            lastUpdatedAt: new Date()
          }
        });
      }
    }
    console.log("[coingecko] Market prices successfully synced.");
  } catch (err: any) {
    console.error("[coingecko] Failed to sync live prices:", err.message);
  }
}

export function startCoinGeckoSync() {
  // Sync immediately on startup
  syncLivePrices();
  // Sync every 2 minutes
  setInterval(syncLivePrices, 2 * 60 * 1000);
}
