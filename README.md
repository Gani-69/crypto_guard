# CryptoGuard

Research/demo project. **Non-custodial. Research-only. All market activity, wallets, balances, and trades are simulated using synthetic data — no real funds, no real custody, no real exchange integration for order execution.** ARES behavioral risk scoring is trained/evaluated on synthetic behavioral data only (no human-subjects data collected this sprint; see `docs/threat-model.md` for what's explicitly out of scope).

## What this is

CryptoGuard is a simulated crypto trading platform with an added security research layer:

- **ARES** (Adaptive Risk Estimation System) — scores session risk from behavioral signals (typing rhythm, correction rate, etc.) and context.
- **Policy Decision Engine** — turns that risk score into a session state: `NORMAL → STEP_UP → RESTRICTED → SHADOW`.
- **Shadow State** — an isolated, fully-functional-looking but fake portfolio shown when risk is consistent with account takeover or physical coercion, structurally separated from real data at the schema level.

See `docs/terminology.md` for locked terminology, `docs/threat-model.md` for scope/limitations, and `docs/prior-art.md` for how this sits relative to existing behavioral-biometrics and duress-wallet research/products.

## Status

Building against the Aug 12 → Aug 30, 2026 sprint plan. Currently: **Block A (Foundation)**.

## Structure

```
backend/          TypeScript/Node API (Express + WebSocket)
  src/api/        REST route modules (auth, session, market, wallet, trading, ares)
  src/ws/         WebSocket server (market ticks, risk-state pushes — later blocks)
  src/db/         Prisma client, seed scripts
  src/services/   business logic (ARES scoring, policy engine, etc. — later blocks)
  prisma/         DB schema (SQLite for dev)
docs/             threat model, terminology, prior-art notes, (writeup lands here in Block H)
```

## Getting started (backend)

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Health check: `GET http://localhost:4000/health`
WebSocket stub: `ws://localhost:4000/ws`

## Roadmap

See the work plan for the full Block A → Block H breakdown. Frontend (market dashboard, wallet UI) lands in Block B.
