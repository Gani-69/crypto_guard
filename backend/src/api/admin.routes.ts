/* ── Admin Routes (F4) ────────────────────────────────────────────────
   All routes require role=ADMIN + recent OTP re-verification (via requireAdmin).

   CRITICAL — Shadow-state isolation:
   These routes must NEVER return Session.state, RiskEvent, PolicyDecision,
   or BehavioralEvent. Exposing those fields would make this panel a
   ground-truth record of every duress-protection activation — defeating
   the coercion-resistance premise of the entire platform.

   Enforcement: every Prisma query uses an explicit select:{} allowlist.
   Do NOT switch to implicit selects (findMany without select). If a new
   field is added to the schema, it will NOT appear in responses until
   explicitly added to the allowlist here.

   Allowlisted fields:
     User list: id, email, phone, displayName, role, kycStatus, createdAt
     User detail: above + session list (id, createdAt, lastActivityAt,
                  expiresAt, revokedAt, ipAddress, userAgent) +
                  webAuthnCredential count only
     NOT included: passwordHash, normalPinHash, masterPinHash, any ARES
                   outputs, Session.state, PinCheckLog, AdminAccessLog targets
   ────────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/admin.middleware";
import { verifyOtp, generateOtp, sendOtpEmail } from "../services/otp.service";

const router = Router();

// All routes chain requireAuth then requireAdmin, except /verify which
// only needs requireAuth (the point of /verify IS to satisfy requireAdmin).

// ── POST /api/admin/verify ────────────────────────────────────────────
// Accepts an OTP code from the CURRENT session's pending OTP.
// Sets session.adminVerifiedAt on success.
// This is the single canonical admin re-verify endpoint.
router.post("/verify", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = req.session!;
    const user = req.user!;

    if (user.role !== "ADMIN") {
      res.status(403).json({ error: "forbidden", message: "Admin access required" });
      return;
    }

    const schema = z.object({ code: z.string().length(6).regex(/^\d{6}$/) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "6-digit OTP code required" });
      return;
    }

    // We need an active OTP for this session. If none exists, generate one now.
    const dbSession = await prisma.session.findUnique({
      where: { id: session.id },
      select: { otpCode: true, otpExpiresAt: true, user: { select: { email: true } } },
    });
    if (!dbSession) {
      res.status(500).json({ error: "internal_error" });
      return;
    }

    if (!dbSession.otpCode) {
      // No OTP exists yet — generate one and tell the client to check their email
      const code = await generateOtp(session.id);
      await sendOtpEmail(dbSession.user.email, code);
      res.status(202).json({
        status: "otp_sent",
        message: "An OTP has been sent to your registered email. Submit it to this endpoint.",
      });
      return;
    }

    const result = await verifyOtp(session.id, parsed.data.code);

    if (!result.ok) {
      if (result.reason === "max_attempts") {
        res.status(403).json({ error: "otp_locked", message: "Too many failed attempts." });
        return;
      }
      res.status(401).json({ error: "otp_invalid", message: "Incorrect or expired OTP." });
      return;
    }

    // OTP verified — update adminVerifiedAt
    await prisma.session.update({
      where: { id: session.id },
      data: { adminVerifiedAt: new Date() },
    });

    res.json({ status: "admin_verified", message: "Admin re-verification successful. Access valid for 5 minutes." });
  } catch (err) {
    console.error("[admin] POST /verify error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────
// Paginated user list. AdminAccessLog written BEFORE data fetch.
router.get("/users", requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUserId = req.user!.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Log BEFORE fetching (a crash mid-request still leaves a record)
    await prisma.adminAccessLog.create({
      data: { adminUserId, viewedUserId: null, action: "list_users" },
    });

    // Explicit select — does NOT include passwordHash, normalPinHash, masterPinHash,
    // sessions, behavioralEvents, riskEvents, policyDecisions, webAuthnCredentials,
    // or any field that could reveal Shadow-state history.
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          phone: true,
          displayName: true,
          role: true,
          kycStatus: true,
          createdAt: true,
        },
      }),
      prisma.user.count(),
    ]);

    res.json({ users, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[admin] GET /users error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/admin/users/:id ──────────────────────────────────────────
// User detail. Same logging-first pattern. Explicit select on every relation.
// TODO: debug-only view of ARES data requires a separate, more restricted gate (out of scope this sprint).
router.get("/users/:id", requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUserId = req.user!.id;
    const targetId = req.params.id;

    // Log BEFORE fetching
    await prisma.adminAccessLog.create({
      data: { adminUserId, viewedUserId: targetId, action: "view_user" },
    });

    // Fetch user with allowlisted fields only.
    // Session select: login timestamps and device info ONLY.
    // Excluded: state, isActive, otpVerified, otpCode, adminVerifiedAt,
    //           riskEvents, policyDecisions, behavioralEvents.
    // User excluded: passwordHash, normalPinHash, masterPinHash.
    // WebAuthn: count only (not credentialId or publicKey).
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        email: true,
        phone: true,
        displayName: true,
        role: true,
        kycStatus: true,
        createdAt: true,
        updatedAt: true,
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            lastActivityAt: true,
            expiresAt: true,
            revokedAt: true,
            ipAddress: true,
            userAgent: true,
            // NOT included: state, isActive, otpCode, otpVerified, otpAttempts,
            //               adminVerifiedAt — any of these would reveal ARES routing history
          },
        },
        webAuthnCredentials: {
          select: {
            id: true,
            createdAt: true,
            // NOT included: credentialId, publicKey — credential material
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    res.json({
      user: {
        ...user,
        webAuthnCredentialCount: user.webAuthnCredentials.length,
        webAuthnCredentials: undefined, // strip the array, surface count only
      },
    });
  } catch (err) {
    console.error("[admin] GET /users/:id error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/admin/logs ───────────────────────────────────────────────
// Returns this admin's own access log entries (own audit trail only).
// Does NOT return ARES data — only the access log itself.
router.get("/logs", requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUserId = req.user!.id;
    const limit = Math.min(100, Number(req.query.limit) || 50);

    // Log BEFORE fetching (own access is also audited)
    await prisma.adminAccessLog.create({
      data: { adminUserId, viewedUserId: null, action: "view_logs" },
    });

    const logs = await prisma.adminAccessLog.findMany({
      where: { adminUserId },
      orderBy: { timestamp: "desc" },
      take: limit,
      select: {
        id: true,
        adminUserId: true,
        viewedUserId: true,
        action: true,
        timestamp: true,
      },
    });

    res.json({ logs });
  } catch (err) {
    console.error("[admin] GET /logs error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/admin/send-verify-otp ──────────────────────────────────
// Generates and sends a fresh OTP to the admin's email for re-verification.
// Useful when the admin session has no pending OTP (e.g. after a clean login).
router.post("/send-verify-otp", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const session = req.session!;

    if (user.role !== "ADMIN") {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const code = await generateOtp(session.id);
    await sendOtpEmail(user.email, code);

    res.json({ status: "otp_sent", message: "Admin verification OTP sent to your email." });
  } catch (err) {
    console.error("[admin] POST /send-verify-otp error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
