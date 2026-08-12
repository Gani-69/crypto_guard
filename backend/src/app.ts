import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";

import authRouter from "./api/auth.routes";
import marketRouter from "./api/market.routes";
import walletRouter from "./api/wallet.routes";
import tradingRouter from "./api/trading.routes";
import aresRouter from "./api/ares.routes";
import sessionRouter from "./api/session.routes";

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
