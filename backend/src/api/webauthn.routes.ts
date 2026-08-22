/* ── WebAuthn Routes (F5) ─────────────────────────────────────────────
   Endpoints for WebAuthn credential registration and authentication.

   /register/begin   — authenticated; generates registration options
   /register/complete — authenticated; stores verified credential
   /authenticate/begin — public; generates authentication options (by email)
   /authenticate/complete — public; verifies assertion, then runs ARES +
                             issues OTP → returns pendingSessionId (same F2 flow)

   Duress parity: manualDuressSignal is accepted on authenticate/complete
   and threaded into the ARES pipeline, giving biometric users the same
   manual escape hatch as password users (handlePointerDown in Login.tsx).
   Behavioral dynamics are still null for biometric logins — see
   docs/writeup.md Limitations.
   ────────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { prisma } from "../db/prisma";
import { requireAuth, AuthenticatedRequest, hashToken } from "../middleware/auth.middleware";
import { runAresPipeline } from "../services/ares.service";
import { generateOtp, sendOtpNotification } from "../services/otp.service";
import {
  getRegistrationOptions,
  completeRegistration,
  getAuthenticationOptions,
  completeAuthentication,
} from "../services/webauthn.service";

const router = Router();

// ── POST /api/webauthn/register/begin ────────────────────────────────
// Requires auth (user must already be logged in to register a credential).
router.post("/register/begin", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const options = await getRegistrationOptions(user.id, user.email);
    res.json(options);
  } catch (err) {
    console.error("[webauthn] POST /register/begin error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/webauthn/register/complete ─────────────────────────────
router.post("/register/complete", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const result = await completeRegistration(user.id, req.body);
    if (!result.ok) {
      res.status(400).json({ error: "registration_failed", reason: result.reason });
      return;
    }
    res.json({ status: "credential_registered" });
  } catch (err) {
    console.error("[webauthn] POST /register/complete error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/webauthn/authenticate/begin ────────────────────────────
// Public. Body: { email }. Looks up the user's credentials and returns options.
router.post("/authenticate/begin", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email_required" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: email.trim().toLowerCase() }, { email: email.trim() }] },
    });
    if (!user) {
      // Return 404 but don't reveal whether the email exists — consistent timing
      res.status(404).json({ error: "no_credentials", message: "No biometric credentials found for this account." });
      return;
    }

    try {
      const options = await getAuthenticationOptions(user.id);
      res.json({ userId: user.id, options });
    } catch (err: any) {
      if (err.message === "no_credentials_registered") {
        res.status(404).json({ error: "no_credentials", message: "No biometric credentials registered for this account." });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error("[webauthn] POST /authenticate/begin error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/webauthn/authenticate/complete ──────────────────────────
// Public. Verifies the WebAuthn assertion, then runs the same F2 flow as
// password login: ARES runs → OTP issued → returns { pendingSessionId }.
// Body: { userId, response, manualDuressSignal? }
router.post("/authenticate/complete", async (req: Request, res: Response) => {
  try {
    const { userId, response, manualDuressSignal } = req.body;

    const userIdSchema = z.string().uuid();
    if (!userIdSchema.safeParse(userId).success || !response) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, kycStatus: true, role: true },
    });
    if (!user) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const authResult = await completeAuthentication(userId, response);
    if (!authResult.ok) {
      res.status(401).json({ error: "authentication_failed", reason: authResult.reason });
      return;
    }

    // WebAuthn verified. Now run the same F2 flow as password login.
    const ipAddress = req.ip || req.headers["x-forwarded-for"] as string || null;
    const userAgent = req.headers["user-agent"] || null;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const tempToken = uuid();
    const tokenHash = hashToken(tempToken);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        ipAddress,
        userAgent,
        expiresAt,
        state: "NORMAL",
        isActive: false,
      },
    });

    // Run ARES with whatever signal we have.
    // manualDuressSignal is threaded in for parity with the password path.
    // Behavioral dynamics (dwellTimeMs etc.) are null for biometric logins —
    // this limitation is documented in docs/writeup.md Limitations.
    const signal = {
      dwellTimeMs: undefined,
      flightTimeMs: undefined,
      typingSpeedCpm: undefined,
      correctionRate: undefined,
      manualDuressSignal: Boolean(manualDuressSignal),
      context: {
        userAgent: userAgent ?? undefined,
        ipAddress: ipAddress ?? undefined,
        deviceType: userAgent?.toLowerCase().includes("mobile") ? "mobile" : "desktop",
        locationCoarse: "US-EAST",
        timeOfDay: getCoarseTimeOfDay(),
      },
    };
    await runAresPipeline(session.id, user.id, signal);

    const code = await generateOtp(session.id);
    await sendOtpNotification(user, code);

    res.json({
      status: "otp_sent",
      pendingSessionId: session.id,
      message: "WebAuthn verified. OTP sent to your registered email and mobile number.",
    });
  } catch (err) {
    console.error("[webauthn] POST /authenticate/complete error:", err);
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
