# Prior-Art Scan (Block A)

Informal scan, a few hours, not a formal literature review. Goal: know where CryptoGuard's novelty claim sits before building. Two adjacent bodies of work; CryptoGuard sits at their intersection, which appears to be where the actual gap is.

## 1. Behavioral biometrics / risk-based continuous authentication

Well-established research area. Representative findings:

- Continuous authentication from keystroke dynamics, touch/swipe, and motion sensors is a mature line of work, but models are known to **degrade under device, session, and activity shifts**, and typically need meaningful labeled data to train well.
- Industry practice (2026) frames this as a **two-mode risk policy**: a "cold-start" window (first ~5–15 sessions) relying on contextual signals only (device, geo, network) because there's no behavioral baseline yet, followed by a "post-baseline" mode that blends contextual + behavioral deviation scoring. This directly informed the cold-start limitation noted in `threat-model.md`.
- A recurring theme across the literature: real imposter data is hard to obtain, motivating unsupervised/outlier-based approaches — relevant justification for CryptoGuard's synthetic-data decision this sprint (we're not claiming a labeled imposter dataset either).
- Existing systems (e.g., keystroke dynamics for hardened passwords, healthcare continuous-auth via behavioral biometrics + vector similarity search) apply this signal family to **authentication decisions** (let the user in / keep them in) — not to routing a session into a fake-but-functional alternate environment.

**Takeaway:** the behavioral-signal-to-risk-score pipeline (ARES) is not novel in isolation — it's a reasonably standard application of continuous risk-based auth research. CryptoGuard's contribution isn't the scoring; it's what happens *after* the score crosses a threshold.

## 2. Duress / decoy-state systems in crypto custody

Also an established, shipping pattern:

- **Coldcard**: duress PIN unlocks a separate wallet derived from the same seed; a distinct "brick me" mode exists for a harder shutdown. Explicitly frames this as plausible deniability of a required time delay, not perfect deniability.
- **Ledger/Trezor passphrase wallets**: any passphrase entered derives a new valid wallet; there's no way to detect whether a wallet exists for a given phrase without trying it. Community guidance around this pattern (the "$5 wrench attack" writeups) includes behavioral advice for the human under coercion (don't comply too fast, have a cover story) — a reminder that the human factor matters as much as the software.
- **Unstoppable Wallet, Edge, Nunchuk, Sync**: mobile wallets with a "Duress Mode" — a separate PIN reveals a fully functional decoy wallet holding a small, sacrificial balance, visually indistinguishable from the real account.
- A useful framing from this space: decoys need to be **"lived-in," not improvised in the moment** — an empty or freshly-created decoy is itself a signal to a sophisticated adversary. CryptoGuard's Shadow State should carry this same lesson (deferred: seeding Shadow with plausible transaction history, not just an empty portfolio).
- The consistently stated limitation across this entire product category: **a sophisticated adversary who knows the duress feature exists can demand the "other" credential.** CryptoGuard inherits this limitation and should state it as plainly as these products do, not paper over it.

**Takeaway:** decoy/duress states for crypto wallets are shipping, real, and well-understood as a category — including their limitations.

## 3. Where CryptoGuard's novelty actually sits

Every duress/decoy system found in this scan is **manually triggered** — the user must consciously enter a separate, memorized credential under pressure. That has a known failure mode the product docs themselves acknowledge: it requires presence of mind in a high-stress moment, and it requires the user to have set it up and practiced it in advance.

CryptoGuard's ARES → Policy Engine pipeline proposes an **implicit trigger**: the Shadow State activates from continuously-scored behavioral risk, not from a memorized manual action. This is the combination that doesn't show up in either body of literature/product docs surveyed above — continuous risk-based auth research targets access decisions, and decoy-state products target manual triggers.

This reframes what "success" means for the writeup: the interesting research question is not "can we detect anomalous behavior" (well-trodden) but **"can implicit, risk-driven triggering be made reliable enough not to either (a) miss real coercion, or (b) degrade a legitimate user's session unnecessarily."** That's exactly the false-positive/false-negative comparison Block G is set up to produce.

## 4. Explicit limitation to carry into the writeup

Every source in this scan that addresses adversary sophistication states the same caveat: if the adversary knows the mechanism exists, they can route around it (demand the "other" state, or in CryptoGuard's case, demand proof from an external source that contradicts the Shadow balances). This is not a CryptoGuard-specific weakness — it's a structural limit of any plausible-deniability approach — but it should be stated plainly in Limitations, not discovered by a reviewer.
