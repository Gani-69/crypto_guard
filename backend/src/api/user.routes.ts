import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

// Zod validation for updating personal details
const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot exceed 50 characters")
    .trim()
    .optional(),
  username: z
    .string()
    .min(3, "User ID must be at least 3 characters")
    .max(30, "User ID cannot exceed 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "User ID can only contain letters, numbers, underscores, and hyphens")
    .trim()
    .optional()
    .nullable(),
});

// Forbidden fields that cannot be altered via profile update
const IMMUTABLE_FIELDS = [
  "phone",
  "email",
  "role",
  "kycStatus",
  "kycData",
  "kycDataJson",
  "kycVerifiedAt",
  "panNumber",
  "aadhaarLast4",
  "upiId",
  "bankAccount",
  "ifsc",
  "passwordHash",
  "normalPinHash",
  "masterPinHash",
  "id",
];

// ── GET /api/user/profile ─────────────────────────────────────────────
// Returns the full registered profile of the authenticated user
router.get("/profile", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.user!;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        wallets: {
          where: { isShadow: false },
          select: { address: true, chain: true },
        },
        _count: {
          select: {
            webAuthnCredentials: true,
            sessions: { where: { revokedAt: null } },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "user_not_found", message: "User profile not found" });
      return;
    }

    // Parse KYC JSON snapshot if available
    let kycData: any = null;
    if (user.kycDataJson) {
      try {
        kycData = JSON.parse(user.kycDataJson);
      } catch (e) {
        console.error("[user] Failed to parse kycDataJson:", e);
      }
    }

    const primaryWallet = user.wallets[0]?.address || "devnet:unassigned";

    res.json({
      success: true,
      profile: {
        id: user.id,
        username: user.username || user.email.split("@")[0],
        displayName: user.displayName || user.email.split("@")[0],
        email: user.email,
        phone: user.phone || "Not linked",
        role: user.role,
        kycStatus: user.kycStatus,
        kycVerifiedAt: user.kycVerifiedAt,
        kycData: kycData
          ? {
              fullName: kycData.fullName,
              panNumber: kycData.panNumber,
              aadhaarLast4: kycData.aadhaarLast4,
              paymentMethod: kycData.paymentMethod,
              upiId: kycData.upiId,
              bankAccount: kycData.bankAccount,
              ifsc: kycData.ifsc,
              verifiedAt: kycData.verifiedAt,
            }
          : null,
        walletAddress: primaryWallet,
        hasPin: Boolean(user.masterPinHash),
        webAuthnCount: user._count.webAuthnCredentials,
        activeSessionsCount: user._count.sessions,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error("[user] GET /profile error:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch user profile" });
  }
});

// ── PUT /api/user/profile ─────────────────────────────────────────────
// Allows modifying ONLY personal details (displayName and username).
// Rejects or ignores modification attempts on protected security/KYC fields.
router.put("/profile", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.user!;
    const body = req.body || {};

    // Check if any immutable fields were attempted to be changed with non-matching values
    const attemptedImmutableKeys = IMMUTABLE_FIELDS.filter(
      (key) => key in body && body[key] !== undefined
    );

    if (attemptedImmutableKeys.length > 0) {
      // Return clear security notice
      res.status(400).json({
        error: "immutable_fields_prohibited",
        message: `Security Warning: Critical identity and KYC records (${attemptedImmutableKeys.join(
          ", "
        )}) cannot be altered directly. Only Name and User ID can be modified.`,
        immutableFields: attemptedImmutableKeys,
      });
      return;
    }

    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        message: parsed.error.errors[0]?.message || "Invalid input data",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { displayName, username } = parsed.data;

    // Check if username is being changed and if it is already taken
    if (username) {
      const normalizedUsername = username.trim().toLowerCase();
      const existingUser = await prisma.user.findFirst({
        where: {
          username: normalizedUsername,
          id: { not: authUser.id },
        },
      });

      if (existingUser) {
        res.status(400).json({
          error: "username_taken",
          message: `The User ID "@${username}" is already taken. Please choose a different User ID.`,
        });
        return;
      }
    }

    // Build update payload
    const updateData: { displayName?: string; username?: string | null } = {};
    if (displayName !== undefined) {
      updateData.displayName = displayName.trim();
    }
    if (username !== undefined) {
      updateData.username = username ? username.trim().toLowerCase() : null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        role: true,
        kycStatus: true,
        kycVerifiedAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      message: "Personal profile details updated successfully!",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        kycStatus: updatedUser.kycStatus,
      },
    });
  } catch (err) {
    console.error("[user] PUT /profile error:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to update profile details" });
  }
});

export default router;
