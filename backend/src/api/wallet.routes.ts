import { Router, Response } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

// GET /api/wallet — portfolio overview: address, balances, holdings with USD valuation
router.get("/", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const session = req.session!;

    // Resolve shadow mode dynamically from the active session state
    const isShadow = session.state === "SHADOW";

    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id, isShadow },
      include: {
        holdings: {
          include: {
            coin: {
              select: {
                id: true,
                symbol: true,
                name: true,
                priceUsd: true,
                change24hPct: true,
                logoUrl: true,
              },
            },
          },
        },
      },
    });

    if (!wallet) {
      res.json({
        wallet: null,
        holdings: [],
        totalValueUsd: 0,
      });
      return;
    }

    // Compute portfolio
    const holdings = wallet.holdings.map((h) => ({
      id: h.id,
      coinId: h.coin.id,
      symbol: h.coin.symbol,
      name: h.coin.name,
      amount: h.amount,
      priceUsd: h.coin.priceUsd,
      valueUsd: h.amount * h.coin.priceUsd,
      change24hPct: h.coin.change24hPct,
      logoUrl: h.coin.logoUrl,
    }));

    const totalValueUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

    res.json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        chain: wallet.chain,
        isShadow: wallet.isShadow,
        createdAt: wallet.createdAt,
      },
      holdings,
      totalValueUsd,
    });
  } catch (err) {
    console.error("[wallet] GET / error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/wallet/transactions — transaction history
router.get("/transactions", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const session = req.session!;
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    // Resolve shadow mode dynamically from the active session state
    const isShadow = session.state === "SHADOW";

    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id, isShadow },
    });

    if (!wallet) {
      res.json({ transactions: [] });
      return;
    }

    const transactions = await prisma.transaction.findMany({
      where: { walletId: wallet.id },
      include: {
        coin: {
          select: { id: true, symbol: true, name: true, priceUsd: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        coinId: tx.coin.id,
        coinSymbol: tx.coin.symbol,
        coinName: tx.coin.name,
        amount: tx.amount,
        priceUsd: tx.priceUsd,
        totalUsd: tx.amount * tx.priceUsd,
        isShadow: tx.isShadow,
        createdAt: tx.createdAt,
      })),
    });
  } catch (err) {
    console.error("[wallet] GET /transactions error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
