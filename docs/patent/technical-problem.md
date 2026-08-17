# Patent Technical Disclosure: Technical Problem & Prior-Art Gaps

This document identifies the technical problem solved by **CryptoGuard** and the specific limitations (gaps) in prior-art technologies.

---

## 1. The Technical Problem

Cryptocurrency custody networks rely on cryptographic keys to authenticate asset transfers. Once authorized, transactions are irreversible and completed within minutes on public ledger networks. This speed and finality have made cryptocurrency holders targets for physical coercion (e.g., "$5 wrench attacks"), extortion, and physical account takeover (ATO).

Existing security infrastructures fail to protect users under physical threat due to two primary technical bottlenecks:

### Problem A: The Cognitive Load and Trigger Failure of Explicit Signaling
Existing duress and decoy wallet architectures (e.g., secondary PINs or decoy passphrases) require **active user recall**. Under intense physical pressure or life-threatening stress, the human user experiences cognitive degradation. This causes:
1. **Trigger Failure:** The victim is unable to remember the decoy credentials.
2. **Stress Tell:** The victim hesitates, stutters, or inputs the credentials incorrectly, alerting the adversary that a decoy mechanism is being used, which can provoke physical escalation.
3. **Accidental Exposure:** The victim inadvertently inputs the primary credentials, exposing their entire portfolio.

### Problem B: Access-Control Response Limitations
Zero-trust network architectures, continuous risk engines, and adaptive authentication frameworks (e.g., BioCatch, Google BeyondCorp) continuously evaluate risk signals. However, their response capability is restricted to access-control decisions:
* **Grant Access** (Normal flow)
* **Require Step-Up Challenge** (MFA, Passcode)
* **Restrict Actions** (Read-only)
* **Block/Terminate Session** (Deny access)

Under physical coercion, blocking access or displaying an error message (e.g., "Access Denied due to suspicious typing speed") is a **hostile action** to the physical adversary. It immediately reveals that the security system has blocked the transfer, exposing the victim to further violence.

---

## 2. Prior-Art Gaps

An analysis of prior patents and literature reveals three distinct gaps that CryptoGuard addresses:

```
┌──────────────────────────────────────┐
│       Prior Art Category A           │
│   Adaptive Access Control            │
│   (BioCatch, BeyondCorp)             │
│   - Continuous risk evaluation       │
│   - Response = Deny / Challenge      │
└──────────────────┬───────────────────┘
                   │
                   ▼ (CryptoGuard Fills This Intersect)
┌──────────────────────────────────────┐
│       CryptoGuard Invention          │
│   Implicit Trigger & Decoy Routing   │
│   - Continuous risk evaluation       │
│   - Response = Decoy state routing   │
└──────────────────▲───────────────────┘
                   │
┌──────────────────┴───────────────────┐
│       Prior Art Category B           │
│   Hardware & Software Decoys         │
│   - Response = Decoy wallet view     │
│   - Trigger = Explicit credential    │
└──────────────────────────────────────┘
```

### Gap 1: Absence of Implicit Triggering in Decoy Wallets
Decoy wallets (e.g., BIP-39 hidden passphrases, dual-PIN software wallets) have no automated activation mechanism. They require the user to input a distinct string of bytes at the login prompt. There is no automated analysis of the user's keystroke flight/dwell times, context, or interaction patterns to trigger the decoy state.

### Gap 2: Access Denial vs. Reality Routing
Continuous behavioral scoring engines evaluate user typing rhythms to compute risk. When risk is elevated, they prompt for MFA or terminate the session. They do not alter the **underlying system representation** (the database query scoping). They do not route the session to a separate database sandbox while maintaining a fully functional frontend loop.

### Gap 3: Invariant Structural Leakage
In standard web application design, decoy or demo modes are often managed at the application/routing layer (e.g., `if (user.isDemo) showMockData()`). This approach is vulnerable to logic bypasses: if a code exception occurs or a network parameter is modified, the system may default back to the authentic database scope, revealing the real portfolio to the adversary.

---

## 3. The CryptoGuard Solution

CryptoGuard solves these technical problems through an **implicit, continuous risk-assessment engine (ARES)** that drives **dynamic database-level query routing (Shadow State)**. 

By analyzing telemetry without explicit user actions, the system eliminates the cognitive recall bottleneck. By routing the user into a structurally isolated shadow state rather than blocking the session, the system satisfies the adversary's demand (visually displaying a valid transaction flow and portfolio) while fully protecting the authentic assets from extraction.
