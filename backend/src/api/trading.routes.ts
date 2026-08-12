import { Router, Response } from "express";
import { prisma } from "../db/prisma";
import { placeOrder, cancelOrder, OrderError } from "../services/trading.service";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

// POST /api/trading/orders — place BUY/SELL, MARKET/LIMIT
router.post("/orders", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { coinId, side, type, quantity, limitPrice } = req.body;
    const user = req.user!;
    const session = req.session!;

    // Validate input
    if (!coinId || !side || !type || quantity === undefined) {
      res.status(400).json({
        error: "Missing required fields: coinId, side, type, quantity",
      });
      return;
    }

    if (!["BUY", "SELL"].includes(side)) {
      res.status(400).json({ error: "side must be BUY or SELL" });
      return;
    }

    if (!["MARKET", "LIMIT"].includes(type)) {
      res.status(400).json({ error: "type must be MARKET or LIMIT" });
      return;
    }

    if (type === "LIMIT" && (limitPrice === undefined || limitPrice <= 0)) {
      res.status(400).json({ error: "limitPrice required and must be positive for LIMIT orders" });
      return;
    }

    if (typeof quantity !== "number" || quantity <= 0) {
      res.status(400).json({ error: "quantity must be a positive number" });
      return;
    }

    // Resolve shadow mode dynamically from the active session state
    const isShadow = session.state === "SHADOW";

    const result = await placeOrder({
      userId: user.id,
      coinId,
      side,
      type,
      quantity,
      limitPrice: limitPrice ?? undefined,
      isShadow,
    });

    res.json(result);
  } catch (err) {
    if (err instanceof OrderError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("[trading] POST /orders error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/trading/orders — order history
router.get("/orders", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const session = req.session!;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const status = req.query.status as string | undefined; // OPEN, FILLED, CANCELLED

    // Resolve shadow mode dynamically from the active session state
    const isShadow = session.state === "SHADOW";

    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id, isShadow },
    });

    if (!wallet) {
      res.json({ orders: [] });
      return;
    }

    const where: Record<string, unknown> = { walletId: wallet.id };
    if (status && ["OPEN", "FILLED", "CANCELLED"].includes(status)) {
      where.status = status;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        coin: {
          select: { id: true, symbol: true, name: true, priceUsd: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      orders: orders.map((o) => ({
        id: o.id,
        coinId: o.coin.id,
        coinSymbol: o.coin.symbol,
        coinName: o.coin.name,
        side: o.side,
        type: o.type,
        quantity: o.quantity,
        limitPrice: o.limitPrice,
        fillPrice: o.fillPrice,
        status: o.status,
        totalUsd: o.fillPrice ? o.quantity * o.fillPrice : o.limitPrice ? o.quantity * o.limitPrice : null,
        isShadow: o.isShadow,
        createdAt: o.createdAt,
        filledAt: o.filledAt,
      })),
    });
  } catch (err) {
    console.error("[trading] GET /orders error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/trading/orders/:id/cancel — cancel an open order
router.post("/orders/:id/cancel", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const session = req.session!;
    const isShadow = session.state === "SHADOW";
    await cancelOrder(req.params.id, user.id, isShadow);
    res.json({ status: "cancelled" });
  } catch (err) {
    if (err instanceof OrderError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("[trading] POST /orders/:id/cancel error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
