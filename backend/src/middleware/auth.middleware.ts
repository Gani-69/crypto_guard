import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    displayName: string | null;
    kycStatus: string;
  };
  session?: {
    id: string;
    state: string;
    tokenHash: string;
    userId: string;
  };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "Missing token" });
      return;
    }

    const token = authHeader.substring(7);
    const tokenHash = hashToken(token);

    // Verify JWT structure/signature
    let decoded: any;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      res.status(401).json({ error: "unauthorized", message: "Invalid token signature" });
      return;
    }

    // Check DB for active session matching the hash
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            kycStatus: true,
          },
        },
      },
    });

    if (!session) {
      res.status(401).json({ error: "unauthorized", message: "Session not found" });
      return;
    }

    if (session.revokedAt) {
      res.status(401).json({ error: "unauthorized", message: "Session revoked" });
      return;
    }

    if (new Date() > session.expiresAt) {
      res.status(401).json({ error: "unauthorized", message: "Session expired" });
      return;
    }

    // Update last activity (non-blocking)
    prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    }).catch((err) => console.error("Failed to update session activity:", err));

    // Attach user and session to request
    req.user = session.user;
    req.session = {
      id: session.id,
      state: session.state,
      tokenHash: session.tokenHash,
      userId: session.userId,
    };

    next();
  } catch (err) {
    console.error("[auth middleware] error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}
