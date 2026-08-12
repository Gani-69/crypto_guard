# Terminology Freeze

Locked as of Block A (Aug 12, 2026). Use these terms consistently across code, docs, and the writeup — renaming mid-project costs more than it's worth.

| Term | Definition |
|---|---|
| **ARES** | Adaptive Risk Estimation System. Consumes behavioral signals (dwell time, flight time, typing speed, correction rate) plus contextual signals (device, time-of-day, navigation pattern) and outputs a risk score, trust score, and confidence for the current session. |
| **Policy Decision Engine** | Consumes ARES output and the current `SessionState`, applies configured thresholds, and decides the next `SessionState`. Owns the state machine: `NORMAL → STEP_UP → RESTRICTED → SHADOW`, plus the recovery path back toward `NORMAL` via step-up challenges. |
| **Session Manager** | Issues/tracks sessions, holds current `SessionState`, and is the single place that resolves "which wallet/state should this request see" — real vs Shadow. |
| **Shadow State** | An isolated demo environment (its own wallet, balances, orders, transaction history) shown to the user when the Policy Engine detects a high-risk / coercion-consistent pattern. Structurally separate rows in the DB (`isShadow=true`), not a filtered view of real data. |
| **Baseline Rule Model** | Deterministic, threshold-based ARES scorer (Block D). Interpretable, low-latency, the control condition for the ML comparison. |
| **ML Model** | Learned ARES scorer trained on synthetic behavioral data (Block D). Compared against the Baseline on accuracy/precision/recall/F1/FPR/FNR (Block G). |
| **AI-assisted Model** | Deferred / stretch goal only. Not required for the Aug 30 deliverable. |
| **Platform Adapter** | Thin interface wrapping the external market-data provider, so swapping providers later doesn't ripple through the dashboard/trading code. |

## Session state machine (locked)

```
NORMAL --(risk rises)--> STEP_UP --(risk rises further)--> RESTRICTED --(coercion-consistent pattern)--> SHADOW
NORMAL <--(step-up passed)-- STEP_UP <--(step-up passed)-- RESTRICTED
```

`SHADOW` is a one-way transition within a session (no "step-up out of Shadow" — exiting means a fresh authenticated login, per the duress-mode precedent in existing wallets: see `docs/prior-art.md`).
