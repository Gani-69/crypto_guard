import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { hashToken, requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";
import { runAresPipeline } from "../services/ares.service";
import { generateOtp, verifyOtp, resendOtp, sendOtpNotification, sendWelcomeEmail } from "../services/otp.service";

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────

// F1: phone is required and validated permissively (E.164-ish, not over-engineered)
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().regex(/^\+?[\d\s\-()\u00A0]{7,20}$/, "Invalid phone number format").trim(),
  displayName: z.string().optional(),
});

const verifyOtpSchema = z.object({
  pendingSessionId: z.string().uuid(),
  code: z.string().length(6).regex(/^\d{6}$/),
});

const resendOtpSchema = z.object({
  pendingSessionId: z.string().uuid(),
});

// ── POST /api/auth/register ───────────────────────────────────────────
// F1: phone is now a required field.
router.post("/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid input",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password, phone, displayName } = parsed.data;
    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: cleanEmail }, { email: email.trim() }] },
    });
    if (existingUser) {
      res.status(400).json({ error: "email_taken", message: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        phone: phone.trim(),
        passwordHash,
        displayName: displayName || cleanEmail.split("@")[0],
        kycStatus: "PENDING",
      },
    });

    // Pre-create authentic wallet (0 balance)
    await prisma.wallet.create({
      data: {
        userId: user.id,
        isShadow: false,
        address: `devnet:${uuid().slice(0, 16)}`,
        chain: "devnet",
      },
    });

    // Pre-create decoy shadow wallet
    await prisma.wallet.create({
      data: {
        userId: user.id,
        isShadow: true,
        address: `devnet:shadow-${uuid().slice(0, 12)}`,
        chain: "devnet",
      },
    });

    // Send automated welcome email via Nodemailer
    sendWelcomeEmail(user.email, user.displayName).catch((err) => {
      console.error("[auth] sendWelcomeEmail error:", err);
    });

    res.status(201).json({
      status: "registered",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        kycStatus: user.kycStatus,
      },
    });
  } catch (err) {
    console.error("[auth] POST /register error:", err);
    res.status(500).json({ error: "internal_error", message: "Internal server error during registration" });
  }
});

// ── POST /api/auth/login (phase 1) ───────────────────────────────────
// F2 ordering invariant (must not drift):
//   1. Password verified.
//   2. Session created with isActive=false.
//   3. ARES pipeline runs — state WRITTEN to DB. This is the only step that decides state.
//   4. OTP generated and sent.
//   5. Returns { pendingSessionId } — NO TOKEN. Client must call /login/verify-otp.
//
// The OTP step never re-runs or overrides the ARES decision from step 3.
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password, signal } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "email_password_required", message: "Email and password required" });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: cleanEmail }, { email: email.trim() }] },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password" });
      return;
    }

    const ipAddress = req.ip || req.headers["x-forwarded-for"] as string || null;
    const userAgent = req.headers["user-agent"] || null;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // We need a tokenHash in the DB (unique constraint), but the real JWT is not
    // issued yet. Use a placeholder hash derived from a temporary UUID.
    const tempToken = uuid();
    const tokenHash = hashToken(tempToken);

    // Step 2: Create session with isActive=false (pending)
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        ipAddress,
        userAgent,
        expiresAt,
        state: "NORMAL",    // ARES may update this in step 3
        isActive: false,    // F2: not active until OTP verified
      },
    });

    // Step 3: Run ARES pipeline (state decision is written to DB here)
    if (signal) {
      const parsedSignal = typeof signal === "string" ? JSON.parse(signal) : signal;
      parsedSignal.context = {
        userAgent,
        ipAddress,
        deviceType: userAgent?.toLowerCase().includes("mobile") ? "mobile" : "desktop",
        locationCoarse: "US-EAST",
        timeOfDay: getCoarseTimeOfDay(),
      };
      await runAresPipeline(session.id, user.id, parsedSignal);
    }

    // Step 4: Generate and send OTP via Email & SMS
    const code = await generateOtp(session.id);
    await sendOtpNotification(user, code);

    // Step 5: Return pendingSessionId only — no token
    res.json({
      status: "otp_sent",
      pendingSessionId: session.id,
      message: "OTP sent to your registered email and mobile number.",
    });
  } catch (err) {
    console.error("[auth] POST /login error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/auth/login/verify-otp (phase 2) ────────────────────────
// F2: Verifies the OTP and — only on success — issues the JWT and activates the session.
// The session state (NORMAL/SHADOW/etc.) was decided in phase 1 and is NOT re-evaluated here.
router.post("/login/verify-otp", async (req: Request, res: Response) => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "pendingSessionId (UUID) and 6-digit code are required" });
      return;
    }

    const { pendingSessionId, code } = parsed.data;
    const result = await verifyOtp(pendingSessionId, code);

    if (!result.ok) {
      if (result.reason === "max_attempts") {
        res.status(403).json({ error: "otp_locked", message: "Too many failed attempts. Please log in again." });
        return;
      }
      if (result.reason === "expired") {
        res.status(401).json({ error: "otp_expired", message: "OTP has expired. Please request a new one." });
        return;
      }
      // Find out how many attempts remain to surface in the response
      const session = await prisma.session.findUnique({ where: { id: pendingSessionId } });
      const attemptsRemaining = Math.max(0, 5 - (session?.otpAttempts ?? 5));
      res.status(401).json({ error: "otp_invalid", message: "Incorrect code.", attemptsRemaining });
      return;
    }

    // OTP verified. Fetch the now-active session to issue the real JWT.
    const session = await prisma.session.findUnique({
      where: { id: pendingSessionId },
      include: { user: { select: { id: true, email: true, displayName: true, kycStatus: true, role: true } } },
    });
    if (!session || !session.user) {
      res.status(500).json({ error: "internal_error" });
      return;
    }

    // Issue the real JWT now. Replace the placeholder tokenHash with the real one.
    const token = jwt.sign(
      { userId: session.user.id, email: session.user.email },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );
    const realTokenHash = hashToken(token);

    await prisma.session.update({
      where: { id: session.id },
      data: { tokenHash: realTokenHash },
    });

    res.json({
      token,
      session: {
        id: session.id,
        state: session.state,
        expiresAt: session.expiresAt,
      },
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        kycStatus: session.user.kycStatus,
        role: session.user.role,
      },
    });
  } catch (err) {
    console.error("[auth] POST /login/verify-otp error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/auth/login/resend-otp ──────────────────────────────────
// F2: Re-sends the OTP to the same email. Max 3 resends per pendingSessionId.
router.post("/login/resend-otp", async (req: Request, res: Response) => {
  try {
    const parsed = resendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "pendingSessionId is required" });
      return;
    }

    const { pendingSessionId } = parsed.data;
    const session = await prisma.session.findUnique({
      where: { id: pendingSessionId },
      include: { user: { select: { email: true, phone: true } } },
    });

    if (!session || !session.user) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    const result = await resendOtp(pendingSessionId);
    if (!result.ok) {
      if (result.reason === "limit_reached") {
        res.status(429).json({ error: "resend_limit", message: "Maximum resend attempts reached. Please log in again." });
        return;
      }
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    await sendOtpNotification(session.user, result.code);
    res.json({ status: "otp_resent", message: "A new OTP has been sent to your registered email and phone." });
  } catch (err) {
    console.error("[auth] POST /login/resend-otp error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/auth/dev-pending-otp (DEV ONLY) ─────────────────────────
// Returns the current OTP plaintext for a pending session.
// ONLY available in development mode. Used by security-tests.ts to avoid
// requiring a real SMTP server for automated testing.
// This endpoint must never be registered in production.
if (env.NODE_ENV !== "production") {
  router.get("/dev-pending-otp", async (req: Request, res: Response) => {
    const { pendingSessionId } = req.query;
    if (!pendingSessionId || typeof pendingSessionId !== "string") {
      res.status(400).json({ error: "pendingSessionId required" });
      return;
    }
    const session = await prisma.session.findUnique({
      where: { id: pendingSessionId },
      select: { otpCode: true, otpExpiresAt: true },
    });
    if (!session?.otpCode) {
      res.status(404).json({ error: "no_otp" });
      return;
    }
    // We can't reverse the bcrypt hash. Instead, generate a fresh OTP
    // (resetting the existing one) and return the plaintext code.
    const { generateOtp } = await import("../services/otp.service");
    const code = await generateOtp(pendingSessionId);
    res.json({ code });
  });
}

// ── POST /api/auth/logout ─────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────

function getCoarseTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export default router;
