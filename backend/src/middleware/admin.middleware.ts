/* ── Admin Middleware (F4) ────────────────────────────────────────────
   requireAdmin chains after requireAuth and enforces two things:
   1. user.role === "ADMIN" (RBAC check).
   2. session.adminVerifiedAt is within the last 5 minutes (re-verification freshness).

   If either check fails, a 403 is returned. Callers should handle the
   "admin_reverify_required" error by prompting the user to call
   POST /api/admin/verify with a fresh OTP.

   Shadow-state isolation note:
   Admin routes must NEVER expose Session.state, RiskEvent, PolicyDecision,
   or BehavioralEvent. This middleware does not enforce that directly \u2014
   it is enforced via explicit Prisma select{} clauses in admin.routes.ts.
   ────────────────────────────────────────────────────────────────────── */

import { Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { AuthenticatedRequest } from "./auth.middleware";

const ADMIN_VERIFY_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user;
    const session = req.session;

    if (!user || !session) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (user.role !== "ADMIN") {
      res.status(403).json({ error: "forbidden", message: "Admin access required" });
      return;
    }

    // Check adminVerifiedAt freshness. We re-fetch from DB to avoid stale
    // req.session data (req.session is set at requireAuth time, before /verify).
    const dbSession = await prisma.session.findUnique({
      where: { id: session.id },
      select: { adminVerifiedAt: true },
    });

    const adminVerifiedAt = dbSession?.adminVerifiedAt;
    const isRecent = adminVerifiedAt && (Date.now() - adminVerifiedAt.getTime()) < ADMIN_VERIFY_TTL_MS;

    if (!isRecent) {
      res.status(403).json({
        error: "admin_reverify_required",
        message: "Admin session requires re-verification. Call POST /api/admin/verify with a valid OTP.",
      });
      return;
    }

    next();
  } catch (err) {
    console.error("[admin middleware] error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}
