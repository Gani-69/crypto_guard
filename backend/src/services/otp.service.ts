/* ── OTP Service (F2) ─────────────────────────────────────────────────
   Generates, delivers, and verifies 6-digit login OTPs.

   Security properties:
   - Code is bcrypt-hashed before storage (same pattern as passwordHash).
   - otpAttempts is incremented BEFORE the bcrypt comparison on each verify
     call, so a crash mid-verify never leaves an unrecorded attempt.
   - After 5 wrong attempts the session is revoked entirely; the user must
     restart the login flow with a fresh session + fresh OTP.
   - Resend rate limiting is tracked in-memory (max 3 per pendingSessionId).
     This is intentionally not persisted — it resets on server restart, which
     is acceptable for a research demo. Production would use Redis or a DB column.

   Email delivery:
   - If SMTP_HOST is set in env, sends via nodemailer.
   - Otherwise, logs the plaintext code to console (matches the existing
     hardcoded step-up bypass pattern in the rest of the codebase).
   ────────────────────────────────────────────────────────────────────── */

import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

// In-memory resend counter: pendingSessionId → { count, lastAt }
const resendTracker = new Map<string, { count: number; lastAt: number }>();

const OTP_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const RESEND_MAX = 3;

// ── Generate & store OTP ──────────────────────────────────────────────

export async function generateOtp(sessionId: string): Promise<string> {
  const code = Math.floor(100_000 + Math.random() * 900_000).toString();
  const codeHash = await bcrypt.hash(code, 8); // 8 rounds — speed matters here, 10 is fine too
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      otpCode: codeHash,
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      otpVerified: false,
      otpAttempts: 0,
    },
  });
  return code; // caller passes to sendOtpEmail
}

// ── Verify OTP (with brute-force lockout) ────────────────────────────

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "invalid" | "max_attempts" | "already_verified" | "session_not_found" };

export async function verifyOtp(
  pendingSessionId: string,
  code: string
): Promise<VerifyResult> {
  const session = await prisma.session.findUnique({
    where: { id: pendingSessionId },
  });

  if (!session) return { ok: false, reason: "session_not_found" };
  if (session.revokedAt) return { ok: false, reason: "session_not_found" };
  if (session.otpVerified) return { ok: false, reason: "already_verified" };
  if (!session.otpCode || !session.otpExpiresAt) return { ok: false, reason: "session_not_found" };

  // Increment attempt counter FIRST — before any comparison.
  // This ensures a crash or timeout mid-comparison is still recorded.
  const newAttempts = session.otpAttempts + 1;
  await prisma.session.update({
    where: { id: pendingSessionId },
    data: { otpAttempts: newAttempts },
  });

  // Lockout check (>5 attempts → revoke)
  if (newAttempts > OTP_MAX_ATTEMPTS) {
    await prisma.session.update({
      where: { id: pendingSessionId },
      data: { revokedAt: new Date() },
    });
    return { ok: false, reason: "max_attempts" };
  }

  // Expiry check
  if (new Date() > session.otpExpiresAt) {
    return { ok: false, reason: "expired" };
  }

  // Code comparison
  const match = await bcrypt.compare(code, session.otpCode);
  if (!match) return { ok: false, reason: "invalid" };

  // Success — activate the session
  await prisma.session.update({
    where: { id: pendingSessionId },
    data: { otpVerified: true, isActive: true },
  });

  // Clean up resend tracker
  resendTracker.delete(pendingSessionId);

  return { ok: true };
}

// ── Resend OTP (rate-limited) ─────────────────────────────────────────

export type ResendResult =
  | { ok: true; code: string }
  | { ok: false; reason: "limit_reached" | "session_not_found" };

export async function resendOtp(pendingSessionId: string): Promise<ResendResult> {
  const session = await prisma.session.findUnique({ where: { id: pendingSessionId } });
  if (!session || session.revokedAt) return { ok: false, reason: "session_not_found" };

  const tracker = resendTracker.get(pendingSessionId) ?? { count: 0, lastAt: 0 };
  if (tracker.count >= RESEND_MAX) {
    return { ok: false, reason: "limit_reached" };
  }

  resendTracker.set(pendingSessionId, { count: tracker.count + 1, lastAt: Date.now() });

  // Reset attempt counter when a new OTP is issued
  const code = await generateOtp(pendingSessionId);
  return { ok: true, code };
}

// ── Send OTP via email (Resend API or SMTP) ──────────────────────────

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  // 1. Try Resend API if configured
  if (env.RESEND_API_KEY) {
    try {
      // In Resend test tier without custom domain, send to registered owner or specified email if override is configured
      const targetEmail = (email.endsWith("@cryptoguard.dev") && env.OTP_TEST_OVERRIDE_EMAIL)
        ? env.OTP_TEST_OVERRIDE_EMAIL
        : email;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "CryptoGuard <onboarding@resend.dev>",
          to: [targetEmail],
          subject: `CryptoGuard Verification Code: ${code}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border-radius: 8px; background: #0b0f19; color: #ffffff;">
              <h2 style="color: #06b6d4; margin-top: 0;">CryptoGuard Security</h2>
              <p>Your one-time authentication code is:</p>
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 16px; background: #162032; border-radius: 6px; text-align: center; color: #38bdf8; margin: 20px 0;">
                ${code}
              </div>
              <p style="color: #94a3b8; font-size: 14px;">This code expires in 5 minutes. If you did not request this login, please secure your account immediately.</p>
            </div>
          `,
        }),
      });

      const resData = (await response.json()) as any;
      if (response.ok) {
        console.log(`[Resend] OTP email delivered to ${targetEmail} (ID: ${resData.id})`);
        return;
      } else {
        console.error("[Resend error]:", resData);
      }
    } catch (err) {
      console.error("[Resend failed, falling back to SMTP]:", err);
    }
  }

  // 2. Fallback to SMTP / Ethereal
  if (env.SMTP_HOST) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: env.SMTP_FROM || `"CryptoGuard" <noreply@cryptoguard.dev>`,
        to: email,
        subject: "Your CryptoGuard login code",
        text: `Your one-time login code is: ${code}\n\nIt expires in 5 minutes. If you didn't request this, ignore this email.`,
        html: `<p>Your one-time login code is: <strong>${code}</strong></p><p>It expires in 5 minutes.</p>`,
      });
      return;
    } catch (err) {
      console.error("[OTP] SMTP delivery failed:", err);
    }
  }

  // 3. Fallback to console log
  console.log(`[OTP fallback] Email: ${email}  Code: ${code}`);
}

// ── Send OTP via SMS (Twilio) ─────────────────────────────────────────

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    return;
  }

  let cleanPhone = phone.trim().replace(/[\s\-()]/g, "");
  if (!cleanPhone) return;

  // Auto format 10-digit number with default +91 if country code missing
  if (/^\d{10}$/.test(cleanPhone)) {
    cleanPhone = "+91" + cleanPhone;
  } else if (!cleanPhone.startsWith("+")) {
    cleanPhone = "+" + cleanPhone;
  }

  try {
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const body = new URLSearchParams({
      To: cleanPhone,
      From: env.TWILIO_PHONE_NUMBER,
      Body: `Your CryptoGuard verification code is: ${code}. It expires in 5 minutes.`,
    }).toString();

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    const data = (await response.json()) as any;
    if (!response.ok) {
      console.error("[Twilio SMS error]:", data.message || data);
    } else {
      console.log(`[Twilio SMS] Sent OTP code to ${cleanPhone} (SID: ${data.sid})`);
    }
  } catch (err) {
    console.error("[Twilio SMS] Failed to send SMS:", err);
  }
}

// ── Send OTP via all available channels (Email + SMS) ─────────────────
export async function sendOtpNotification(
  user: { email: string; phone?: string | null },
  code: string
): Promise<void> {
  await Promise.allSettled([
    sendOtpEmail(user.email, code),
    user.phone ? sendOtpSms(user.phone, code) : Promise.resolve(),
  ]);
}
