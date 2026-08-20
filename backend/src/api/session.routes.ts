import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";
import { prisma } from "../db/prisma";

const router = Router();

// GET /api/session/me — returns profile & current active session details
router.get("/me", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = req.session!;
    const user = req.user!;

    // Query fresh session state from database
    const freshSession = await prisma.session.findUnique({
      where: { id: session.id },
      select: { state: true, expiresAt: true, createdAt: true },
    });

    res.json({
      authenticated: true,
      user,
      session: {
        id: session.id,
        state: freshSession?.state ?? "NORMAL",
        createdAt: freshSession?.createdAt,
        expiresAt: freshSession?.expiresAt,
      },
    });
  } catch (err) {
    console.error("[session] GET /me error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/session/step-up — complete step-up challenge to restore session to NORMAL
router.post("/step-up", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    const session = req.session!;

    if (!code || code !== "123456") {
      res.status(400).json({ error: "invalid_code", message: "Incorrect verification passcode." });
      return;
    }

    const freshSession = await prisma.session.findUnique({
      where: { id: session.id },
    });

    if (!freshSession) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    const fromState = freshSession.state;

    // Security Decoy Logic: If the session is in SHADOW, we must NEVER revert it.
    // Return a fake success message to the client, but leave the database state untouched!
    if (fromState === "SHADOW") {
      res.json({
        success: true,
        message: "Decoy step-up verification completed.",
        sessionState: "NORMAL", // Decoy response state
      });
      return;
    }

    // Revert STEP_UP or RESTRICTED session back to NORMAL state
    if (fromState === "STEP_UP" || fromState === "RESTRICTED") {
      await prisma.session.update({
        where: { id: session.id },
        data: { state: "NORMAL" },
      });

      // Log policy transition
      await prisma.policyDecision.create({
        data: {
          sessionId: session.id,
          fromState,
          toState: "NORMAL",
          reason: "User successfully completed Step-Up passcode verification challenge.",
        },
      });
    }

    res.json({
      success: true,
      message: "Step-up challenge passed. Session restored to NORMAL.",
      sessionState: "NORMAL",
    });
  } catch (err) {
    console.error("[session] POST /step-up error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/session/admin/users — returns list of all registered users
router.get("/admin/users", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        wallets: {
          select: {
            address: true,
            chain: true,
            isShadow: true,
          }
        }
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ users });
  } catch (err) {
    console.error("[session] GET /admin/users error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/session/admin/logs — returns audit log of all active and inactive sessions
router.get("/admin/logs", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      include: {
        user: {
          select: { email: true, displayName: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100, // Cap at 100 logs
    });
    res.json({ sessions });
  } catch (err) {
    console.error("[session] GET /admin/logs error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
