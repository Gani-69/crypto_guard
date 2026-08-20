import { Router, Response } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

// GET /api/wallet — portfolio overview: address, balances, holdings with USD valuation
router.get("/", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const session = req.session!;

    // Ensure INR coin exists in the database for fiat gate simulation
    let inrCoin = await prisma.coin.findUnique({ where: { symbol: "INR" } });
    if (!inrCoin) {
      try {
        await prisma.coin.create({
          data: {
            symbol: "INR",
            name: "Cash (INR)",
            priceUsd: 1 / 83.5,
            marketCapUsd: 500000000,
            volume24hUsd: 12000000,
            change24hPct: 0,
            logoUrl: "https://cdn-icons-png.flaticon.com/512/2529/2529398.png",
            rank: 999
          }
        });
      } catch (e) {
        // Ignore duplicate errors
      }
    }

    // Resolve shadow mode dynamically: default to session state, but force decoy if requested
    const isShadow = session.state === "SHADOW" || req.query.decoy === "true";

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

    // Resolve shadow mode dynamically from the active session state, forcing decoy if requested
    const isShadow = session.state === "SHADOW" || req.query.decoy === "true";

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

// POST /api/wallet/transaction — Deposit or withdraw custom asset balances
router.post("/transaction", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, coinId, amount, decoy } = req.body;
    const user = req.user!;
    const session = req.session!;

    if (!type || !["DEPOSIT", "WITHDRAWAL"].includes(type)) {
      res.status(400).json({ error: "invalid_type", message: "Transaction type must be DEPOSIT or WITHDRAWAL." });
      return;
    }

    if (!coinId || amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "invalid_input", message: "Valid coinId and positive amount are required." });
      return;
    }

    const coin = await prisma.coin.findUnique({ where: { id: coinId } });
    if (!coin) {
      res.status(404).json({ error: "coin_not_found", message: "Asset not found." });
      return;
    }

    // Resolve shadow mode dynamically from the active session state, forcing decoy if requested
    const isShadow = session.state === "SHADOW" || decoy === true;

    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id, isShadow },
    });

    if (!wallet) {
      res.status(404).json({ error: "wallet_not_found", message: "User wallet not found." });
      return;
    }

    const holding = await prisma.holding.findUnique({
      where: { walletId_coinId: { walletId: wallet.id, coinId: coin.id } }
    });

    if (type === "WITHDRAWAL") {
      if (!holding || holding.amount < amount) {
        res.status(400).json({ error: "insufficient_balance", message: `Insufficient ${coin.symbol} balance.` });
        return;
      }
    }

    // Perform transaction and update holdings in a database transaction
    await prisma.$transaction(async (tx) => {
      // Create Transaction record
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          coinId: coin.id,
          type,
          amount: Number(amount),
          priceUsd: coin.priceUsd,
          isShadow: wallet.isShadow,
        }
      });

      // Update Holding record
      if (type === "DEPOSIT") {
        await tx.holding.upsert({
          where: { walletId_coinId: { walletId: wallet.id, coinId: coin.id } },
          create: { walletId: wallet.id, coinId: coin.id, amount: Number(amount) },
          update: { amount: { increment: Number(amount) } }
        });
      } else {
        // Withdrawal
        const newAmount = Math.max(0, holding!.amount - Number(amount));
        if (newAmount === 0) {
          await tx.holding.delete({
            where: { id: holding!.id }
          });
        } else {
          await tx.holding.update({
            where: { id: holding!.id },
            data: { amount: newAmount }
          });
        }
      }
    });

    res.json({
      success: true,
      message: `${type === "DEPOSIT" ? "Deposit" : "Withdrawal"} of ${amount} ${coin.symbol} completed successfully.`
    });
  } catch (err) {
    console.error("[wallet] POST /transaction error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
