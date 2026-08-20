/* ── Simulated Trading Engine ─────────────────────────────────────────
   All trades are synthetic / non-custodial / devnet-only.
   
   Market orders → fill immediately at current coin price.
   Limit orders  → fill immediately if price condition is met,
                    otherwise remain OPEN (no real order book).
   
   The engine updates:
     - Order status (OPEN → FILLED)
     - Wallet holdings (create or update Holding rows)
     - Transaction log
   
   Shadow isolation: if the session is in SHADOW state,
   the wallet resolved will be the shadow wallet.
   ──────────────────────────────────────────────────────────────── */

import { prisma } from "../db/prisma";

export interface PlaceOrderInput {
  userId: string;
  coinId: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP_LIMIT";
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  isShadow?: boolean; // Block E — defaults to false
}

export interface OrderResult {
  order: {
    id: string;
    side: string;
    type: string;
    quantity: number;
    limitPrice: number | null;
    stopPrice: number | null;
    fillPrice: number | null;
    status: string;
    coinSymbol: string;
    coinName: string;
    createdAt: Date;
    filledAt: Date | null;
  };
  message: string;
}

export async function placeOrder(input: PlaceOrderInput): Promise<OrderResult> {
  const { userId, coinId, side, type, quantity, limitPrice, stopPrice, isShadow = false } = input;

  // Validate quantity
  if (quantity <= 0) throw new OrderError("Quantity must be positive");

  // Get the coin
  const coin = await prisma.coin.findUnique({ where: { id: coinId } });
  if (!coin) throw new OrderError("Coin not found");

  // Get or create wallet
  let wallet = await prisma.wallet.findFirst({
    where: { userId, isShadow },
    include: { holdings: true },
  });

  if (!wallet) {
    // Auto-create wallet on first trade
    const { v4 } = await import("uuid");
    wallet = await prisma.wallet.create({
      data: {
        userId,
        isShadow,
        address: `devnet:${isShadow ? "shadow-" : ""}${v4().slice(0, 16)}`,
        chain: "devnet",
      },
      include: { holdings: true },
    });
  }

  // For SELL: check we have enough holdings
  if (side === "SELL") {
    const holding = wallet.holdings.find((h) => h.coinId === coinId);
    const currentAmount = holding?.amount ?? 0;
    if (currentAmount < quantity) {
      throw new OrderError(
        `Insufficient ${coin.symbol} balance: have ${currentAmount.toFixed(6)}, need ${quantity}`
      );
    }
  }

  // Determine fill price
  const currentPrice = coin.priceUsd;
  let fillPrice: number | null = null;
  let shouldFill = false;

  if (type === "MARKET") {
    fillPrice = currentPrice;
    shouldFill = true;
  } else if (type === "LIMIT" && limitPrice !== undefined) {
    // Buy limit: fill if current price <= limit price
    // Sell limit: fill if current price >= limit price
    if (side === "BUY" && currentPrice <= limitPrice) {
      fillPrice = currentPrice;
      shouldFill = true;
    } else if (side === "SELL" && currentPrice >= limitPrice) {
      fillPrice = currentPrice;
      shouldFill = true;
    }
  } else if (type === "STOP_LIMIT" && limitPrice !== undefined && stopPrice !== undefined) {
    // Buy stop-limit: triggers if current price >= stop price
    // Sell stop-limit: triggers if current price <= stop price
    let isTriggered = false;
    if (side === "BUY" && currentPrice >= stopPrice) {
      isTriggered = true;
    } else if (side === "SELL" && currentPrice <= stopPrice) {
      isTriggered = true;
    }

    if (isTriggered) {
      // Once triggered, it behaves like a limit order
      if (side === "BUY" && currentPrice <= limitPrice) {
        fillPrice = currentPrice;
        shouldFill = true;
      } else if (side === "SELL" && currentPrice >= limitPrice) {
        fillPrice = currentPrice;
        shouldFill = true;
      }
    }
  }

  // Create the order
  const order = await prisma.order.create({
    data: {
      walletId: wallet.id,
      coinId,
      side,
      type,
      quantity,
      limitPrice: limitPrice ?? null,
      stopPrice: stopPrice ?? null,
      fillPrice,
      status: shouldFill ? "FILLED" : "OPEN",
      isShadow,
      filledAt: shouldFill ? new Date() : null,
    },
  });

  // If filled, update holdings and create transaction
  if (shouldFill && fillPrice !== null) {
    await executeOrderFill(wallet.id, coinId, side, quantity, fillPrice, order.id, isShadow);
  }

  return {
    order: {
      id: order.id,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      limitPrice: order.limitPrice,
      stopPrice: order.stopPrice,
      fillPrice: order.fillPrice,
      status: order.status,
      coinSymbol: coin.symbol,
      coinName: coin.name,
      createdAt: order.createdAt,
      filledAt: order.filledAt,
    },
    message: shouldFill
      ? `${side} ${quantity} ${coin.symbol} filled at ${formatUsdSimple(fillPrice!)}`
      : type === "STOP_LIMIT"
      ? `${side} stop-limit order placed for ${quantity} ${coin.symbol} (Trigger: ${formatUsdSimple(stopPrice!)}, Limit: ${formatUsdSimple(limitPrice!)})`
      : `${side} limit order placed for ${quantity} ${coin.symbol} at ${formatUsdSimple(limitPrice!)}`,
  };
}

async function executeOrderFill(
  walletId: string,
  coinId: string,
  side: "BUY" | "SELL",
  quantity: number,
  fillPrice: number,
  orderId: string,
  isShadow: boolean
) {
  // Update or create holding
  const existing = await prisma.holding.findUnique({
    where: { walletId_coinId: { walletId, coinId } },
  });

  if (side === "BUY") {
    if (existing) {
      await prisma.holding.update({
        where: { id: existing.id },
        data: { amount: existing.amount + quantity },
      });
    } else {
      await prisma.holding.create({
        data: { walletId, coinId, amount: quantity },
      });
    }
  } else {
    // SELL — reduce holdings
    if (existing) {
      const newAmount = existing.amount - quantity;
      if (newAmount <= 0.000001) {
        await prisma.holding.delete({ where: { id: existing.id } });
      } else {
        await prisma.holding.update({
          where: { id: existing.id },
          data: { amount: newAmount },
        });
      }
    }
  }

  // Create transaction
  await prisma.transaction.create({
    data: {
      walletId,
      orderId,
      coinId,
      type: side, // BUY or SELL
      amount: quantity,
      priceUsd: fillPrice,
      isShadow,
    },
  });
}

// ── Cancel an open order ──
export async function cancelOrder(orderId: string, userId: string, isShadow = false): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { wallet: true },
  });

  if (!order) throw new OrderError("Order not found");
  if (order.wallet.userId !== userId) throw new OrderError("Not your order");
  if (order.isShadow !== isShadow) throw new OrderError("Order not found");
  if (order.status !== "OPEN") throw new OrderError("Only OPEN orders can be cancelled");

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
  });
}

// ── Error class ──
export class OrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderError";
  }
}

function formatUsdSimple(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
