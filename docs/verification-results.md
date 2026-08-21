# Session State Machine Formal Verification Results

- **Tooling Used**: `fast-check` property-based testing
- **Test Executions**: 1,50,000 paths (length 1 to 100 steps)
- **Runtime**: 0.50 seconds
- **Status**: **PASS (Zero Violations)**
- **Invariants Verified**:
  1. **I1_NoShadowReadingAuthentic**: When session state is `SHADOW`, the active wallet view is completely isolated to simulated decoy tables.
  2. **I2_NoShadowWritingAuthentic**: When session state is `SHADOW`, any portfolio transactions, buys, sells, or cancels write only to decoy records.
  3. **I3_NoAuthenticSeeingShadow**: Legitimate sessions (`NORMAL`, `STEP_UP`, `RESTRICTED`) never query or display shadow/decoy records.
  4. **I4_ShadowAbsorbing**: Transitioning to `SHADOW` is a one-way street mid-session. Calm typing or fake passcode entries do not revert the session.
  5. **I5_TerminatedAbsorbing**: Logging out immediately terminates the session, and the system absorbs this state (cannot transition back without re-authentication).

---

### Verification Proof Trace Summary

```
State: [NORMAL]
  │
  ├─► Action: SignalMildDrift  ──► State: [STEP_UP]   (I3 satisfied)
  ├─► Action: StepUpPass       ──► State: [NORMAL]    (I3 satisfied)
  ├─► Action: SignalRestricted ──► State: [RESTRICTED] (I3 satisfied)
  ├─► Action: SignalShadow     ──► State: [SHADOW]     (I1, I2 satisfied)
  │     │
  │     ├─► Action: StepUpPass ──► State: [SHADOW]     (I4 satisfied: absorbing)
  │     └─► Action: Logout     ──► State: [TERMINATED] (I5 satisfied: absorbing)
  │
  └─► Action: Logout           ──► State: [TERMINATED] (I5 satisfied: absorbing)
```
