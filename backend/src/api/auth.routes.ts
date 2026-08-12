import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { hashToken, requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";
import { runAresPipeline } from "../services/ares.service";

const router = Router();

// POST /api/auth/register — Register new account + precreate wallets
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "email_password_required", message: "Email and password are required" });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: "email_taken", message: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: displayName || email.split("@")[0],
      },
    });

    // Pre-create authentic wallet
    const realWallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        isShadow: false,
        address: `devnet:${uuid().slice(0, 16)}`,
        chain: "devnet",
      },
    });

    // Give new user starting balance for simulation: 0.5 BTC, 10 ETH
    const btc = await prisma.coin.findUnique({ where: { symbol: "BTC" } });
    const eth = await prisma.coin.findUnique({ where: { symbol: "ETH" } });

    if (btc) {
      await prisma.holding.create({
        data: { walletId: realWallet.id, coinId: btc.id, amount: 0.5 },
      });
    }
    if (eth) {
      await prisma.holding.create({
        data: { walletId: realWallet.id, coinId: eth.id, amount: 10.0 },
      });
    }

    // Pre-create decoy shadow wallet
    await prisma.wallet.create({
      data: {
        userId: user.id,
        isShadow: true,
        address: `devnet:shadow-${uuid().slice(0, 12)}`,
        chain: "devnet",
      },
    });

    res.status(201).json({
      status: "registered",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (err) {
    console.error("[auth] POST /register error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/auth/login — Authenticate, start session, run initial ARES check
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password, signal } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "email_password_required", message: "Email and password required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password" });
      return;
    }

    // Issue JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    const tokenHash = hashToken(token);
    const ipAddress = req.ip || req.headers["x-forwarded-for"] as string || null;
    const userAgent = req.headers["user-agent"] || null;

    // Define expiration based on JWT duration config
    // Standard default of 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Save session in DB
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        ipAddress,
        userAgent,
        expiresAt,
        state: "NORMAL", // Always starts NORMAL
      },
    });

    // If client provided initial typing behavior on login forms, process ARES immediately
    if (signal) {
      const parsedSignal = typeof signal === "string" ? JSON.parse(signal) : signal;
      // Inject context
      parsedSignal.context = {
        userAgent,
        ipAddress,
        deviceType: userAgent?.toLowerCase().includes("mobile") ? "mobile" : "desktop",
        locationCoarse: "US-EAST", // Standard mock location for ARES baseline checks
        timeOfDay: getCoarseTimeOfDay(),
      };
      await runAresPipeline(session.id, user.id, parsedSignal);
    }

    // Fetch updated session state in case ARES triggered immediately
    const updatedSession = await prisma.session.findUnique({ where: { id: session.id } });

    res.json({
      token,
      session: {
        id: session.id,
        state: updatedSession?.state ?? "NORMAL",
        expiresAt: session.expiresAt,
      },
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (err) {
    console.error("[auth] POST /login error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/auth/logout — Revoke active session token
router.post("/logout", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = req.session;
    if (session) {
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }

    res.json({ status: "logged_out" });
  } catch (err) {
    console.error("[auth] POST /logout error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

function getCoarseTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export default router;
