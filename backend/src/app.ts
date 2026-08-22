import path from "path";
import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";

import authRouter from "./api/auth.routes";
import marketRouter from "./api/market.routes";
import walletRouter from "./api/wallet.routes";
import tradingRouter from "./api/trading.routes";
import aresRouter from "./api/ares.routes";
import sessionRouter from "./api/session.routes";
import webAuthnRouter from "./api/webauthn.routes";
import adminRouter from "./api/admin.routes";
import pinRouter from "./api/pin.routes";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "cryptoguard-backend" });
  });

  // NOTE: research/demo disclaimer surfaced on every response header,
  // cheap way to keep it visible through the whole stack.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-CryptoGuard-Notice", "non-custodial, research-only, synthetic data");
    next();
  });

  app.use("/api/auth", authRouter);
  app.use("/api/session", sessionRouter);
  app.use("/api/market", marketRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/trading", tradingRouter);
  app.use("/api/ares", aresRouter);
  app.use("/api/webauthn", webAuthnRouter);  // F5
  app.use("/api/admin", adminRouter);         // F4
  app.use("/api/pin", pinRouter);             // F3

  // Serve static assets from frontend build in production
  const frontendDistPath = path.join(__dirname, "../../frontend/dist");
  app.use(express.static(frontendDistPath));

  // Fallback to React index.html for client-side routing
  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(frontendDistPath, "index.html"), (err) => {
        if (err) {
          next();
        }
      });
    } else {
      next();
    }
  });

  // 404
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "not_found", path: req.originalUrl });
  });

  // Central error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
