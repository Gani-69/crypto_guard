/* ── PIN Routes (F3) ──────────────────────────────────────────────────
   Master PIN gate for wallet/balance access.

   Core invariant I6 (must not drift):
     session.state === "SHADOW" ⇒ PIN identity has no effect on returned
     wallet data. The isShadow branch is resolved FIRST, and only reached
     the PIN comparison step if session.state is NORMAL.

   normalPinHash usage:
     normalPinHash is NEVER compared at check-balance time. It exists only
     so that /setup can enforce that the two PINs differ (preventing the
     master PIN from being detectable by elimination). Any non-master input
     during a NORMAL session returns the decoy (shadow) wallet.
   ────────────────────────────────────────────────────────────────────── */

import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

// ── Validation ────────────────────────────────────────────────────────

const pinSchema = z.string()
  .min(4, "PIN must be at least 4 digits")
  .max(8, "PIN must be at most 8 digits")
  .regex(/^\d{4,8}$/, "PIN must contain only digits");

// ── POST /api/pin/setup ───────────────────────────────────────────────
// Sets normalPin and masterPin for the authenticated user.
// Both are required, both are validated, and they must differ.
// Called post-registration during the onboarding flow — not at registration itself.
router.post("/setup", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const schema = z.object({
      normalPin: pinSchema,
      masterPin: pinSchema,
    }).refine((d) => d.normalPin !== d.masterPin, {
      message: "Normal PIN and Master PIN must be different",
      path: ["masterPin"],
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid PIN",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { normalPin, masterPin } = parsed.data;
    const [normalPinHash, masterPinHash] = await Promise.all([
      bcrypt.hash(normalPin, 10),
      bcrypt.hash(masterPin, 10),
    ]);

    await prisma.user.update({
      where: { id: user.id },
      data: { normalPinHash, masterPinHash },
    });

    res.json({ status: "pins_set", message: "PINs configured successfully." });
  } catch (err) {
    console.error("[pin] POST /setup error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/pin/check-balance ───────────────────────────────────────
// Invariant I6 enforcement:
//   Step 1: resolve isShadow from session.state (ALWAYS first, no exception).
//   Step 2: if isShadow=true → return shadow wallet regardless of PIN.
//   Step 3: if isShadow=false → compare pin against masterPinHash ONLY.
//           Match → authentic wallet. No match → decoy (shadow) wallet.
//           normalPinHash is never read here.
//   Step 4: log outcome to PinCheckLog.
router.post("/check-balance", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = req.session!;
    const user = req.user!;

    const schema = z.object({ pin: pinSchema });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "Invalid PIN format" });
      return;
    }

    const { pin } = parsed.data;

    // Step 1: resolve shadow mode from session state (mirrors wallet.routes.ts line 35)
    // This is always the first branch — PIN identity plays no role when state=SHADOW.
    const isShadow = session.state === "SHADOW";

    let outcome: "shadow_bypass" | "normal_master" | "normal_decoy";

    if (isShadow) {
      // I6: SHADOW session → return shadow data, ignore PIN entirely
      outcome = "shadow_bypass";
    } else {
      // NORMAL session: compare against masterPinHash only
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { masterPinHash: true },
      });

      if (!dbUser?.masterPinHash) {
        // PINs not set up yet — treat as master (show real wallet)
        outcome = "normal_master";
      } else {
        const isMaster = await bcrypt.compare(pin, dbUser.masterPinHash);
        outcome = isMaster ? "normal_master" : "normal_decoy";
      }
    }

    // Determine which wallet to return based on outcome
    const showShadow = outcome !== "normal_master";

    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id, isShadow: showShadow },
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

    // Step 4: log outcome (DOES NOT store the PIN or session state)
    await prisma.pinCheckLog.create({
      data: { sessionId: session.id, outcome },
    });

    if (!wallet) {
      res.json({ wallet: null, holdings: [], totalValueUsd: 0, outcome });
      return;
    }

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
      outcome, // returned for client display ("Welcome back" vs silent decoy)
    });
  } catch (err) {
    console.error("[pin] POST /check-balance error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/pin/status ───────────────────────────────────────────────
// Returns whether PINs are configured for the user (without exposing the hashes).
// The frontend uses this to decide whether to show the PIN setup prompt.
router.get("/status", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { normalPinHash: true, masterPinHash: true },
    });

    res.json({
      pinsConfigured: Boolean(dbUser?.normalPinHash && dbUser?.masterPinHash),
    });
  } catch (err) {
    console.error("[pin] GET /status error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
