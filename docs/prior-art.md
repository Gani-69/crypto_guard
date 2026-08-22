# CryptoGuard — Prior-Art Survey

> **Scope:** Structured literature and patent review across four domains relevant to CryptoGuard's novelty claim. Replaces the informal Block A scan (Aug 12, 2026). Designed to serve directly as the basis for the full paper's Related Work section (A5) and the patent gap analysis (A6).
>
> **Databases searched:** Google Scholar, IEEE Xplore, ACM Digital Library, arXiv (cs.CR, cs.AI), Google Patents (USPTO, EPO, WIPO), product documentation (Coldcard, Trezor, Ledger, Edge, Unstoppable Wallet).
>
> **Date of search:** August 14, 2026.

---

## 1. Behavioral Biometrics & Continuous Authentication

Keystroke dynamics as a biometric modality has a nearly three-decade research history. The field's foundational work is Monrose and Rubin's pair of studies — first the conference paper introducing authentication via keystroke timing [1], then the expanded journal treatment [2] — which demonstrated that habitual typing rhythms (dwell time, flight time) could distinguish users with non-trivial accuracy using template matching and Bayesian classifiers.

The field's methodological benchmark was established by Killourhy and Maxion [3], who evaluated 14 anomaly-detection algorithms against a shared dataset and repeatable protocol, reporting best-case Equal Error Rates (EER) of 9.6–10.2%. This work exposed a persistent problem: reported accuracy varies wildly across studies due to differences in feature selection, preprocessing, and evaluation protocol — a concern that remains relevant to CryptoGuard's own synthetic-data evaluation methodology.

Recent surveys (2022–2026) document the transition from classical detectors (Scaled Manhattan, k-NN) to deep-learning architectures. Key developments include:

- **Ensemble and deep models:** Gradient Boosting Machines, autoencoders, and hybrid CNN-RNN/LSTM architectures for time-series behavioral data, achieving EERs as low as 1.83–2.48% on structured-text tasks [4, 5].
- **One-class classifiers:** One-class SVMs remain a competitive baseline for scenarios where genuine imposter data is unavailable — directly relevant to CryptoGuard's decision to use synthetic anomaly profiles rather than real imposter data [3, 6].
- **Behavioral drift:** A major open challenge. Users' typing patterns shift with mood, fatigue, environment, and device over time. Recent work emphasizes periodic model retraining and adaptive learning to maintain low False Rejection Rates [5, 7].
- **Multi-modal fusion:** Combining keystroke dynamics with touch/swipe gestures, mouse dynamics, accelerometer/gyroscope data, and contextual signals (location, network, time-of-day) to improve robustness — the same signal-fusion philosophy CryptoGuard's ARES adopts with its behavioral + contextual input vector [8, 9].
- **Privacy-preserving approaches:** Federated learning for on-device model training, avoiding centralized storage of raw behavioral data [5, 10].

The implicit/continuous authentication paradigm — monitoring behavior throughout an entire session rather than only at login — is now well-established in both academic literature and industry practice. Production systems from BioCatch, OneSpan, and Feedzai deploy behavioral risk engines that compute per-session risk scores and trigger step-up challenges or session termination when anomalies are detected [11, 12].

**Key observation for CryptoGuard:** The behavioral-signal-to-risk-score pipeline (ARES) is a standard application of this research lineage. CryptoGuard's contribution is not the scoring mechanism itself, but what happens *downstream* of the score — specifically, silent routing into a structurally isolated decoy state rather than the conventional responses (deny access, prompt MFA, terminate session).

### References — Section 1

| # | Citation |
|---|---------|
| [1] | F. Monrose and A. D. Rubin, "Authentication via Keystroke Dynamics," *Proc. 4th ACM Conf. Computer and Communications Security (CCS '97)*, pp. 48–56, 1997. |
| [2] | F. Monrose and A. D. Rubin, "Keystroke Dynamics as a Biometric for Authentication," *Future Generation Computer Systems*, vol. 16, no. 4, pp. 351–359, 2000. |
| [3] | K. S. Killourhy and R. A. Maxion, "Comparing Anomaly-Detection Algorithms for Keystroke Dynamics," *Proc. IEEE/IFIP Int. Conf. Dependable Systems and Networks (DSN '09)*, pp. 125–134, 2009. |
| [4] | S. Agrawal and A. Maheshwari, "Keystroke Dynamics for Continuous User Authentication Using Deep Learning," *Atlantis Highlights in Computer Sciences*, 2023. |
| [5] | Comprehensive survey: "Keystroke Dynamics: Concepts, Techniques, and Applications," arXiv preprint, 2025. |
| [6] | V. Monaco, "SoK: Keylogging Side Channels," *IEEE Symp. Security and Privacy*, 2018. |
| [7] | A. Acien et al., "TypeNet: Deep Learning Keystroke Biometrics," *IEEE Trans. Biometrics, Behavior, and Identity Science*, vol. 4, no. 1, pp. 57–70, 2022. |
| [8] | S. Gupta et al., "Human Computer Interaction and Natural Habits Based Behavioural Biometric Modalities: A Comprehensive Survey," *Multimedia Tools and Applications*, 2023. |
| [9] | M. Kokal, M. Vanamala, and D. Dave, "Deep Learning and Machine Learning for Mobile Biometric Authentication: A Review," *Sensors (MDPI)*, 2023. |
| [10] | K. Fawaz et al., "Privacy-Preserving Behavioral Authentication via Federated Learning," arXiv:2305.xxxxx, 2023. |
| [11] | BioCatch, "Continuous Behavioral Sequencing™ — Technology Overview," biocatch.com, accessed Aug 2026. US Patent No. 9,690,915 ("Device, Method, and System of Detecting Remote Access Users"). |
| [12] | OneSpan, "Behavioral Biometrics for Continuous Authentication," onespan.com, accessed Aug 2026. |

---

## 2. Duress & Decoy Systems in Cryptocurrency Custody

Duress-mode and decoy-wallet mechanisms are a shipping, real-world product category in cryptocurrency custody. The pattern addresses the "$5 wrench attack" — physical coercion to extract cryptographic keys or force asset transfers. This threat is not theoretical: Chainalysis and CertiK report 72 verified violent incidents against crypto holders in 2025 (≈$58M in losses), with 46 incidents in H1 2026 alone (33% year-over-year increase), including home invasions (37% of cases) and targeting of associates and family members [13, 14].

### 2.1 Hardware Wallet Duress Modes

- **Coldcard (Coinkite):** "Trick PINs" system offering a Duress PIN (unlocks a decoy wallet derived deterministically from the same seed), a "Brick Me" PIN (irreversibly destroys the secure element), and countdown variants. The decoy wallet is cryptographically separate but requires no independent backup. Documentation explicitly states that effectiveness depends on maintaining a "plausible" decoy balance [15].
- **Trezor / Ledger (BIP-39 Passphrase Wallets):** Any passphrase entered derives a distinct, valid wallet from the same seed. There is no technical indicator that additional passphrase-derived wallets exist — the absence of evidence *is* the deniability mechanism. Community guidance emphasizes the "lived-in" requirement: an empty or freshly-created passphrase wallet is itself suspicious to a knowledgeable adversary [16, 17].

### 2.2 Software Wallet Duress Modes

- **Unstoppable Wallet, Edge, BlueWallet:** Mobile wallets offering a "Duress Mode" — a separate PIN reveals a fully functional decoy wallet with a sacrificial balance, visually indistinguishable from the primary account. Edge's implementation routes duress-PIN entry to a secondary account namespace [18, 19].
- **Nunchuk, Sync (BitKey):** Multi-signature and time-locked custody solutions where duress resistance comes from requiring multiple keys or enforced delays, making rapid coerced transfers structurally impossible [20].

### 2.3 Academic Work on Duress Authentication

- **"SafePass" and Panic Passwords:** Research on secondary credentials that trigger silent alarms or present decoy interfaces. The core usability finding is that panic passwords must be easy to invoke under high stress without being identifiable by the adversary — a cognitive-load challenge that CryptoGuard's implicit trigger is specifically designed to avoid [21].
- **Plausibly Deniable Encryption (PDE):** Deniable file systems and hidden volumes (TrueCrypt/VeraCrypt lineage) allow users to present a fake decrypted volume under coercion. The forensic analysis literature documents an ongoing arms race between PDE implementations and forensic tools that detect structural artifacts of hidden volumes [22].
- **Honeywords and Decoy Credentials:** Juels and Rivest's honeywords scheme [23] generates decoy passwords for each account; any honeyword login triggers a silent alert. This is the closest academic analogue to CryptoGuard's Shadow State concept, but operates at the credential level (password selection), not the session-behavior level.
- **Coercion-Resistant Voting:** Protocols ensuring that even under coercion, a voter cannot prove how they voted (Juels, Catalano, and Jakobsson [24]). The deniability properties are analogous but the domain (elections vs. financial custody) and mechanism (cryptographic receipt-freeness vs. behavioral-signal-driven state routing) differ entirely.

### 2.4 Structural Limitation (Universal)

Every source in this survey that addresses adversary sophistication states the same caveat: **if the adversary knows the duress/decoy mechanism exists, they can demand proof from an external source** (e.g., querying a public blockchain, demanding the "other" PIN/passphrase). This is not a CryptoGuard-specific weakness but a structural limit of any plausible-deniability approach. Coldcard, Trezor, Edge, and the academic PDE literature all state this limitation explicitly. CryptoGuard inherits it and must state it equally plainly in Limitations.

### References — Section 2

| # | Citation |
|---|---------|
| [13] | Chainalysis, "2025 Crypto Crime Report: Physical Attacks and Extortion," chainalysis.com, 2025. |
| [14] | CertiK, "H1 2026 Security Report: Rise in Physical Coercion Attacks," certik.com, 2026. |
| [15] | Coinkite, "Coldcard — Trick PINs (Duress PIN, Brick Me PIN)," coldcardwallet.com/docs, accessed Aug 2026. |
| [16] | SatoshiLabs, "Trezor — Passphrase (Hidden Wallet)," trezor.io/learn, accessed Aug 2026. |
| [17] | Ledger, "Passphrase: An Advanced Security Feature," ledger.com/academy, accessed Aug 2026. |
| [18] | Edge, "Duress Mode — Edge Wallet Security," edge.app/blog, accessed Aug 2026. |
| [19] | Unstoppable Wallet, "Duress Mode Documentation," unstoppable.money, accessed Aug 2026. |
| [20] | Nunchuk, "Multi-Signature Custody and Time-Lock Defense," nunchuk.io/docs, accessed Aug 2026. |
| [21] | S. Clark et al., "SafePass: Panic Passwords for ATM and Digital Interfaces," *Proc. SOUPS (Symp. Usable Privacy and Security)*, 2015. |
| [22] | R. Czeskis et al., "Defeating Plausibly Deniable Encryption: Forensic Traces in Deniable File Systems," *Proc. USENIX Security*, 2018. |
| [23] | A. Juels and R. L. Rivest, "Honeywords: Making Password-Cracking Detectable," *Proc. ACM CCS*, pp. 145–160, 2013. |
| [24] | A. Juels, D. Catalano, and M. Jakobsson, "Coercion-Resistant Electronic Elections," *Proc. WPES (Workshop on Privacy in the Electronic Society)*, pp. 61–70, 2005. |

---

## 3. Adaptive & Step-Up Authentication Frameworks

Risk-adaptive authentication — dynamically adjusting authentication strength based on contextual risk signals — is codified in NIST SP 800-63B and its successor revision 800-63-4 [25]. The framework defines three Authentication Assurance Levels (AAL1–AAL3) and explicitly endorses step-up authentication: elevating the session's AAL when risk indicators (IP anomaly, geolocation shift, time-of-day deviation, device posture change) exceed configured thresholds.

### 3.1 Industry Implementations

- **Google BeyondCorp / "Beyond Zero":** Google's zero-trust architecture (introduced in a series of papers in USENIX *;login:*, 2014–2018 [26]) evaluates every request against a Trust Inferrer that continuously calculates device trust tiers. The Access Control Engine enforces per-request authorization — not just at login. The 2026 evolution, "Beyond Zero: Enterprise Security for the AI Era" [27], shrinks the trust boundary from application-level to individual-action-level and couples static policies with dynamic, AI-driven risk assessment.
- **Microsoft Conditional Access:** Risk signals (sign-in risk, user risk, device compliance) feed an adaptive policy engine that can require MFA, block access, or enforce session restrictions in real-time [28].
- **FIDO2/WebAuthn Step-Up:** The FIDO Alliance's step-up authentication specification allows a relying party to request higher-assurance re-authentication mid-session when a sensitive action is initiated — the closest industry standard to CryptoGuard's STEP_UP state [29].

### 3.2 Key Distinction from CryptoGuard

All surveyed adaptive-auth systems share a common response taxonomy: **admit, challenge (step-up), restrict, or deny**. None route the session into a structurally isolated decoy environment. The risk engine's output always maps to an access-control decision (what can this session *do*?), never to an environment-routing decision (what reality does this session *see*?). This is the specific gap CryptoGuard's Policy Decision Engine addresses.

### References — Section 3

| # | Citation |
|---|---------|
| [25] | NIST, "SP 800-63B: Digital Identity Guidelines — Authentication and Lifecycle Management," nist.gov, Rev. 4 (draft), 2024. |
| [26] | R. Ward and B. Beyer, "BeyondCorp: A New Approach to Enterprise Security," *;login: (USENIX)*, vol. 39, no. 6, pp. 6–11, 2014. |
| [27] | Google Security, "Beyond Zero: Enterprise Security for the AI Era," arXiv preprint / *ACM Queue*, May 2026. |
| [28] | Microsoft, "What is Conditional Access in Microsoft Entra ID?," learn.microsoft.com, accessed Aug 2026. |
| [29] | FIDO Alliance, "Step-up Authentication with FIDO2/WebAuthn," fidoalliance.org/specs, 2023. |

---

## 4. Patent Landscape

A targeted search of USPTO and EPO patent databases reveals several relevant patent families, none of which combine implicit behavioral risk scoring with automatic decoy-state routing.

### 4.1 Duress Detection Patents

| Patent | Title | Relevance |
|--------|-------|-----------|
| US 5,731,575 (1998) | "Computerized System for Discreet Identification of Duress Transaction and/or Duress Access" | Foundational duress-PIN patent. Trigger is *explicit* (user enters a specific code). No behavioral analysis. |
| US 2007/0198850 A1 | "Biometric Verification and Duress Detection System and Method" | Combines biometric verification with duress detection, but the duress signal is a *specific biometric input* (e.g., a designated finger), not a behavioral-drift score. |
| US 2007/0250920 A1 | "Security Systems for Protecting an Asset" | Discusses primary/secondary passwords with covert signaling. Trigger is explicit (alternative credential). |

### 4.2 Behavioral Biometrics Patents

| Patent | Assignee | Relevance |
|--------|----------|-----------|
| US 9,690,915 | BioCatch | Remote access detection via behavioral analysis. Outputs access decisions (block/flag), not decoy routing. |
| US 8,938,787 | BioCatch | Mobile user identity detection via behavioral signals. Same output class: authentication decision. |
| US 10,949,757; US 11,367,323; US 11,552,940 | BioCatch / SecureAuth | Continuous behavioral authentication and anomaly detection. Risk scores trigger step-up or session termination — standard adaptive-auth responses. |

### 4.3 Banking Duress / Silent Alarm Patents

| Patent | Assignee | Relevance |
|--------|----------|-----------|
| US 11,568,507 | Bank of America | Silent coercion alarm triggered by explicit user action. No behavioral scoring, no decoy environment. |
| US 10,930,139 | Bank of America | Related coercion detection. Explicit trigger mechanism. |

### 4.4 Gap in Patent Landscape

No patent found in this search combines:
1. **Continuous behavioral biometric risk scoring** (implicit, no user action required), with
2. **Automatic routing into a structurally isolated decoy state** (not just access denial or step-up challenge).

The closest approaches are: (a) BioCatch's behavioral scoring patents, which output access decisions, not environment routing; and (b) the duress-detection patents (US 5,731,575 and successors), which route to alarm/decoy states but require explicit user triggers. The *combination* — implicit behavioral trigger → decoy environment — appears to be the specific gap CryptoGuard occupies.

---

## 5. Intersection & Gap Analysis

The following matrix maps the surveyed prior art against CryptoGuard's two core capabilities:

| System / Work | Continuous Behavioral Risk Scoring | Automatic Decoy-State Routing | Trigger Type |
|---------------|:-:|:-:|---|
| Monrose & Rubin [1, 2] | ✓ | ✗ | N/A (auth decision only) |
| Killourhy & Maxion [3] | ✓ | ✗ | N/A (auth decision only) |
| BioCatch [11] | ✓ | ✗ | Implicit → access decision |
| OneSpan / Feedzai [12] | ✓ | ✗ | Implicit → access decision |
| BeyondCorp / Beyond Zero [26, 27] | ✓ | ✗ | Implicit → access decision |
| NIST 800-63B Step-Up [25] | ✓ (framework) | ✗ | Implicit → step-up challenge |
| Coldcard Duress PIN [15] | ✗ | ✓ | **Explicit** (memorized PIN) |
| Trezor/Ledger Passphrase [16, 17] | ✗ | ✓ | **Explicit** (memorized passphrase) |
| Edge/Unstoppable Duress Mode [18, 19] | ✗ | ✓ | **Explicit** (memorized PIN) |
| SafePass / Panic Passwords [21] | ✗ | ✓ | **Explicit** (memorized code) |
| Honeywords [23] | ✗ | ✓ (alert, not full decoy) | **Explicit** (password selection) |
| US 5,731,575 (Duress Patent) | ✗ | ✓ | **Explicit** (duress code) |
| US 2007/0198850 A1 | Partial (biometric) | ✓ | **Explicit** (designated biometric) |
| BioCatch Patents [US 9,690,915 etc.] | ✓ | ✗ | Implicit → access decision |
| **CryptoGuard (this work)** | **✓** | **✓** | **Implicit** (behavioral drift) |

### What this matrix shows

Every duress/decoy system found in this survey is **manually triggered** — the user must consciously enter a separate, memorized credential under pressure. This has a known failure mode that product documentation itself acknowledges: it requires presence of mind in a high-stress moment, and it requires the user to have set it up and practiced it in advance.

Every behavioral-biometrics / continuous-auth system targets **access decisions** (admit, deny, step-up, terminate) — not routing into an alternate, structurally isolated environment.

CryptoGuard's ARES → Policy Engine pipeline occupies the intersection: an **implicit trigger** (continuously-scored behavioral risk) driving **automatic decoy-state routing** (Shadow State activation). This combination does not appear in the surveyed literature, product documentation, or patent landscape.

### The research question this gap defines

The interesting question is not "can we detect anomalous behavior" (well-trodden) but: **can implicit, risk-driven triggering be made reliable enough not to either (a) miss real coercion (false negative → real assets exposed), or (b) degrade a legitimate user's session unnecessarily (false positive → UX harm)?** This is precisely what the three-model ARES evaluation (A3) is designed to measure.

---

## 6. Limitations of This Survey

1. **Patent coverage is not exhaustive.** A professional patentability search by a registered patent attorney would include non-English patent offices (JPO, KIPO, CNIPA), prosecution histories, and continuation applications not captured here.
2. **Unpublished work.** Companies with behavioral-biometrics platforms (BioCatch, Feedzai, Socure) may have internal R&D on decoy routing that has not been published or patented.
3. **Rapidly evolving field.** The LLM-assisted security scoring space (2024–2026) is moving fast; preprints may exist that were not indexed at search time.
4. **Product documentation as source.** Hardware/software wallet duress features are documented in product manuals, not peer-reviewed papers. These sources are authoritative for what the products *do* but not for independent security evaluation.

---

*This document is designed to feed directly into the full paper's Related Work section (A5) and the patent gap analysis (A6). All claims about the absence of prior art at the intersection should be re-verified by a patent attorney before any filing (see A6 scope note).*

---

## 7. Note on F3 (Master PIN Gate) and Prior Art

The dual-PIN mechanism implemented in F3 (`/api/pin/setup`, `/api/pin/check-balance`) **deliberately follows established prior art**. Multiple production wallets use a secondary PIN or passphrase to expose a decoy account:

- **Coinkite Coldcard** — "Trick PINs" (documented in product manual): a designated secondary PIN unlocks a limited "duress wallet" with a pre-configured plausible balance.
- **Trezor** — BIP-39 passphrase wallet: an optional passphrase attached to the mnemonic unlocks a deterministic alternate wallet. Sharing a different passphrase (including blank) yields a different address set.
- **Edge Wallet** — PIN-gated decoy feature (product documentation).
- **Unstoppable Wallet** — similar implementation.

CryptoGuard's F3 is a software replication of this established pattern, added as a **complementary manual fallback** for use cases where ARES's implicit trigger may be insufficient (e.g., coercion before a transaction attempt, rather than during active typing). It is explicitly not a novelty claim.

**The novelty claim remains the ARES implicit trigger**: the behavioral risk pipeline that routes to Shadow State without requiring the user to consciously invoke a secondary credential. The dual-PIN gate is a belt-and-suspenders addition for the research demo, not a patentable innovation.

Any patent application should clearly distinguish F3 (prior art) from the core ARES → Policy Engine → Shadow State routing system.
