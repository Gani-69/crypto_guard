/* ── WebAuthn Service (F5) ────────────────────────────────────────────
   Handles WebAuthn registration and authentication ceremonies using
   @simplewebauthn/server. No third-party service, no new secret.

   Challenge storage: short-lived in-memory map (TTL 2 min).
   In production this would be Redis or a DB column, but for the
   research demo in-memory is fine and matches the codebase pattern
   used by the resend tracker in otp.service.ts.

   Duress-signaling limitation (documented in docs/writeup.md):
   A WebAuthn tap generates no keystroke dynamics, so ARES receives
   all-null behavioral signals. The caller (webauthn.routes.ts) passes
   manualDuressSignal from the client, which is the same escape hatch
   the password path uses via handlePointerDown in Login.tsx.
   ────────────────────────────────────────────────────────────────────── */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

// In-memory challenge store: userId → { challenge, expiresAt }
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();
const CHALLENGE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function storeChallenge(userId: string, challenge: string): void {
  challengeStore.set(userId, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function consumeChallenge(userId: string): string | null {
  const entry = challengeStore.get(userId);
  if (!entry) return null;
  challengeStore.delete(userId);
  if (Date.now() > entry.expiresAt) return null;
  return entry.challenge;
}

// ── Registration ceremony ─────────────────────────────────────────────

export async function getRegistrationOptions(userId: string, userEmail: string) {
  const existingCredentials = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true },
  });

  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userID: Buffer.from(userId),
    userName: userEmail,
    userDisplayName: userEmail,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      type: "public-key" as const,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  storeChallenge(userId, options.challenge);
  return options;
}

export async function completeRegistration(
  userId: string,
  response: RegistrationResponseJSON
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const expectedChallenge = consumeChallenge(userId);
  if (!expectedChallenge) return { ok: false, reason: "challenge_expired" };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      requireUserVerification: false,
    });
  } catch (err: any) {
    return { ok: false, reason: err.message ?? "verification_failed" };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, reason: "verification_failed" };
  }

  // @simplewebauthn/server v13+: credential info is nested under registrationInfo.credential
  const { credential } = verification.registrationInfo;

  await prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
    },
  });

  return { ok: true };
}

// ── Authentication ceremony ───────────────────────────────────────────

export async function getAuthenticationOptions(userId: string) {
  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true },
  });

  if (credentials.length === 0) {
    throw new Error("no_credentials_registered");
  }

  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    userVerification: "preferred",
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      type: "public-key" as const,
    })),
  });

  storeChallenge(userId, options.challenge);
  return options;
}

export async function completeAuthentication(
  userId: string,
  response: AuthenticationResponseJSON
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const expectedChallenge = consumeChallenge(userId);
  if (!expectedChallenge) return { ok: false, reason: "challenge_expired" };

  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
  });

  if (!credential || credential.userId !== userId) {
    return { ok: false, reason: "credential_not_found" };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      requireUserVerification: false,
      // v13+ credential shape
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, "base64"),
        counter: credential.counter,
      },
    });
  } catch (err: any) {
    return { ok: false, reason: err.message ?? "verification_failed" };
  }

  if (!verification.verified) {
    return { ok: false, reason: "verification_failed" };
  }

  // Increment counter for replay protection
  await prisma.webAuthnCredential.update({
    where: { credentialId: credential.credentialId },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  return { ok: true };
}
