# CryptoGuard — Lightweight Threat Model (Block A draft)

Scope: enough to justify design decisions for the Aug 30 demo and short writeup. Not a full STRIDE/PASTA exercise — that's post-Aug-30 scope.

## 1. What CryptoGuard is

A simulated (non-custodial, synthetic-data) crypto trading platform with an added layer: ARES continuously scores session risk from behavioral + contextual signals, and a Policy Engine can silently degrade a session into an isolated **Shadow State** — a fully functional but fake wallet/portfolio — when the risk pattern is consistent with account takeover or physical coercion.

## 2. Primary threat actors

| Actor | Goal | Capability |
|---|---|---|
| **Remote attacker (credential theft / ATO)** | Take over a session using stolen credentials or a hijacked token, drain the account. | Can authenticate with valid-looking credentials; cannot replicate the legitimate user's behavioral pattern from a cold start. |
| **Coercive physical adversary** | Force the legitimate, already-authenticated user to hand over / operate the device and move funds. | Has physical access and the real user's cooperation under duress; cannot fake calm, normal behavioral rhythm on demand. |
| **Sophisticated adversary aware of Shadow State** | Detect that a Shadow session is Shadow, and force the real one. | Same as above, plus knowledge that the feature exists (per the "rubber hose cryptanalysis" limitation documented in comparable duress-mode products — see prior art). |

## 3. What ARES + Policy Engine + Shadow State does and does not defend against

**In scope for this sprint:**
- Session-level behavioral drift detection (is this still plausibly the same person typing?) as a signal into risk scoring.
- Graceful, non-alarming degradation (`STEP_UP → RESTRICTED → SHADOW`) instead of a binary lock-out, so a coercive actor sees a plausible working platform rather than a visible refusal.
- Structural isolation: Shadow-state writes physically cannot reach real-state rows (separate `isShadow=true` records, verified by the isolation test in Block E).

**Explicitly out of scope / acknowledged limitation:**
- **Detection by a sophisticated adversary.** If the coercer knows CryptoGuard has a Shadow State and demands proof of "real" balances (e.g., via an external block explorer), the system cannot currently produce a fully convincing decoy under close scrutiny. This mirrors the same limitation documented by existing duress-wallet products (Coldcard, Unstoppable Wallet, Edge — see `docs/prior-art.md`).
- **Manual duress triggers are not the mechanism here.** Unlike prior art (separate PIN = decoy), CryptoGuard's trigger is *implicit*, driven by ARES risk scoring rather than a memorized manual action. That's the novelty claim, but it also means Shadow activation depends on model quality — a missed detection (false negative) leaves the real session exposed, and a false positive degrades a legitimate user's session unnecessarily. Both error rates are exactly what Block G measures.
- **Cold-start users.** ARES needs a baseline behavioral profile; a brand-new account has no drift to detect against. Out of scope to solve this sprint (industry practice is a "pre-baseline" risk mode relying on contextual signals only — noted for future work).
- **Physical device compromise / malware on the client** — not modeled this sprint.
- **Real funds, real custody, real KYC/AML** — irrelevant; platform is explicitly non-custodial, simulated, synthetic-data only (see README disclaimer).

## 4. Design decisions this threat model justifies

- Behavioral signals captured **continuously** (not just at login), because both ATO and coercion scenarios can occur mid-session.
- Shadow State is **structurally isolated at the schema level** (separate rows, `isShadow` flag), not just gated by application logic — a logic bug in the UI layer should not be able to leak real balances into a Shadow session or vice versa.
- Two-model ARES comparison (Baseline Rule vs ML) exists specifically to make false-positive/false-negative trade-offs visible and measurable rather than asserted.

## 5. Non-goals for Aug 30

Formal verification (TLA+), IRB-grade human behavioral dataset, resistance to a sophisticated adversary who already knows the system's internals, production-grade key custody. All explicitly deferred — see work plan.

---

## 6. Formal Invariants (I1–I6)

These are the invariants verified by `security-tests.ts` and the `fast-check` property-based suite:

| ID | Invariant | Enforcement |
|---|---|---|
| **I1** | A Shadow session can never read `isShadow=false` wallet rows. | `wallet.routes.ts` always filters on `session.state`. |
| **I2** | A Shadow session can never write `isShadow=false` rows (orders, transactions, holdings). | `trading.routes.ts` and `wallet.routes.ts` propagate `isShadow` from session state to all writes. |
| **I3** | `session.state` is set exclusively by `runAresPipeline` — never by client input. | Only `auth.routes.ts` (login phase 1) calls `runAresPipeline`. |
| **I4** | OTP verification does not re-evaluate or override ARES's state decision. | `auth.routes.ts` phase 2 (`/login/verify-otp`) only reads the already-written state; it never calls `runAresPipeline`. |
| **I5** | Admin routes never expose `Session.state`, `RiskEvent`, `PolicyDecision`, or `BehavioralEvent`. | `admin.routes.ts` uses explicit `select: {}` Prisma allowlists. Implicit selects are banned in that file. |
| **I6** | `session.state === "SHADOW"` ⟹ PIN identity has no effect on wallet data returned. Shadow sessions always receive decoy wallet regardless of which PIN is entered. | `pin.routes.ts` resolves `isShadow` from `session.state` **first**, before any PIN comparison. The master PIN is only compared when `isShadow === false`. |

**I6 is the critical invariant for F3 (Master PIN gate)**: without it, a Shadow session could brute-force the master PIN and escalate to authentic data, defeating the coercion-resistance guarantee. The enforcement is a single conditional check in `pin.routes.ts:check-balance` that returns early with `outcome = "shadow_bypass"` before any PIN read.
