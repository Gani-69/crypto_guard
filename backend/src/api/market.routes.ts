import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma";

const router = Router();

// GET /api/market/coins — list + search + trending
// Query params: ?search=btc&trending=true&sort=rank&order=asc&limit=50
router.get("/coins", async (req: Request, res: Response) => {
  try {
    const {
      search,
      trending,
      sort = "rank",
      order = "asc",
      limit = "50",
    } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { symbol: { contains: search.toUpperCase() } },
        { name: { contains: search, } },
      ];
    }

    if (trending === "true") {
      where.isTrending = true;
    }

    const validSorts = ["rank", "priceUsd", "marketCapUsd", "volume24hUsd", "change24hPct", "name", "symbol"];
    const sortField = validSorts.includes(sort ?? "") ? sort : "rank";
    const sortOrder = order === "desc" ? "desc" : "asc";

    const coins = await prisma.coin.findMany({
      where,
      orderBy: { [sortField!]: sortOrder },
      take: Math.min(Number(limit) || 50, 100),
      select: {
        id: true,
        symbol: true,
        name: true,
        priceUsd: true,
        marketCapUsd: true,
        volume24hUsd: true,
        change24hPct: true,
        logoUrl: true,
        rank: true,
        isTrending: true,
        priceHistory7d: true, // Needed for sparkline slice
      },
    });

    // Build slim sparkline (last 20 price points only)
    const coinsWithSparkline = coins.map((c) => {
      let sparkline: number[] = [];
      if (c.priceHistory7d) {
        try {
          const history: Array<{ price: number }> = JSON.parse(c.priceHistory7d);
          sparkline = history.slice(-20).map((p) => p.price);
        } catch {
          // ignore parse errors
        }
      }
      const { priceHistory7d: _dropped, ...rest } = c;
      return { ...rest, sparkline };
    });

    res.json({ coins: coinsWithSparkline, count: coins.length });

  } catch (err) {
    console.error("[market] GET /coins error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/market/coins/:id — coin detail + chart data
// :id can be the coin UUID or the symbol (e.g., "BTC")
router.get("/coins/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Try by ID first, then by symbol
    let coin = await prisma.coin.findUnique({ where: { id } });
    if (!coin) {
      coin = await prisma.coin.findUnique({ where: { symbol: id.toUpperCase() } });
    }

    if (!coin) {
      res.status(404).json({ error: "coin_not_found" });
      return;
    }

    // Parse the JSON price history for the response
    const priceHistory = coin.priceHistory7d
      ? JSON.parse(coin.priceHistory7d)
      : [];

    res.json({
      ...coin,
      priceHistory7d: priceHistory,
    });
  } catch (err) {
    console.error("[market] GET /coins/:id error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/market/watchlist — demo user's watchlist
// NOTE: uses hardcoded demo user until auth is wired in Block D
router.get("/watchlist", async (req: Request, res: Response) => {
  try {
    // In Block D+ this comes from the authenticated session.
    // For now, find the demo user.
    const user = await prisma.user.findFirst({
      where: { email: "demo@cryptoguard.dev" },
    });

    if (!user) {
      res.json({ watchlist: [] });
      return;
    }

    const items = await prisma.watchlistItem.findMany({
      where: { userId: user.id },
      include: {
        coin: {
          select: {
            id: true,
            symbol: true,
            name: true,
            priceUsd: true,
            marketCapUsd: true,
            volume24hUsd: true,
            change24hPct: true,
            logoUrl: true,
            rank: true,
            isTrending: true,
          },
        },
      },
      orderBy: { addedAt: "desc" },
    });

    res.json({
      watchlist: items.map((item) => ({
        ...item.coin,
        watchlistItemId: item.id,
        addedAt: item.addedAt,
      })),
    });
  } catch (err) {
    console.error("[market] GET /watchlist error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/market/watchlist — add coin to watchlist
router.post("/watchlist", async (req: Request, res: Response) => {
  try {
    const { coinId } = req.body;
    if (!coinId) {
      res.status(400).json({ error: "coinId required" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { email: "demo@cryptoguard.dev" },
    });
    if (!user) {
      res.status(401).json({ error: "no_user" });
      return;
    }

    const existing = await prisma.watchlistItem.findUnique({
      where: { userId_coinId: { userId: user.id, coinId } },
    });

    if (existing) {
      res.json({ status: "already_exists" });
      return;
    }

    await prisma.watchlistItem.create({
      data: { userId: user.id, coinId },
    });

    res.json({ status: "added" });
  } catch (err) {
    console.error("[market] POST /watchlist error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// DELETE /api/market/watchlist/:coinId — remove coin from watchlist
router.delete("/watchlist/:coinId", async (req: Request, res: Response) => {
  try {
    const { coinId } = req.params;

    const user = await prisma.user.findFirst({
      where: { email: "demo@cryptoguard.dev" },
    });
    if (!user) {
      res.status(401).json({ error: "no_user" });
      return;
    }

    await prisma.watchlistItem.deleteMany({
      where: { userId: user.id, coinId },
    });

    res.json({ status: "removed" });
  } catch (err) {
    console.error("[market] DELETE /watchlist/:coinId error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/market/stats — aggregate market statistics for dashboard
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const coins = await prisma.coin.findMany();
    const totalMarketCap = coins.reduce((sum, c) => sum + (c.marketCapUsd ?? 0), 0);
    const totalVolume24h = coins.reduce((sum, c) => sum + (c.volume24hUsd ?? 0), 0);
    const avgChange24h = coins.reduce((sum, c) => sum + (c.change24hPct ?? 0), 0) / coins.length;
    const gainers = coins.filter((c) => (c.change24hPct ?? 0) > 0).length;
    const losers = coins.filter((c) => (c.change24hPct ?? 0) < 0).length;

    res.json({
      totalCoins: coins.length,
      totalMarketCap,
      totalVolume24h,
      avgChange24h: Math.round(avgChange24h * 100) / 100,
      gainers,
      losers,
    });
  } catch (err) {
    console.error("[market] GET /stats error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
