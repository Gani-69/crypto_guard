/**
 * Quick ARES model verification — ensure both scorers produce expected outputs
 * for known input vectors.
 */
import {
  evaluateBaselineRule,
  evaluateMLModel,
  type BehavioralSignalInput,
} from "../services/ares.service";

// ── Test vectors ─────────────────────────────────────────────────────

const LEGITIMATE: BehavioralSignalInput = {
  dwellTimeMs: 110,
  flightTimeMs: 175,
  typingSpeedCpm: 250,
  correctionRate: 0.05,
  context: { deviceType: "desktop", locationCoarse: "US-EAST" },
};

const COERCED: BehavioralSignalInput = {
  dwellTimeMs: 200,
  flightTimeMs: 520,
  typingSpeedCpm: 75,
  correctionRate: 0.40,
  context: { deviceType: "desktop", locationCoarse: "US-EAST" },
};

const CONTEXT_MISMATCH: BehavioralSignalInput = {
  dwellTimeMs: 110,
  flightTimeMs: 175,
  typingSpeedCpm: 250,
  correctionRate: 0.05,
  context: { deviceType: "mobile", locationCoarse: "ASIA-PAC" },
};

const BOT_FAST: BehavioralSignalInput = {
  dwellTimeMs: 15,
  flightTimeMs: 10,
  typingSpeedCpm: 900,
  correctionRate: 0.0,
  context: { deviceType: "desktop", locationCoarse: "US-EAST" },
};

const vectors: { label: string; signal: BehavioralSignalInput }[] = [
  { label: "LEGITIMATE (normal user)", signal: LEGITIMATE },
  { label: "COERCED / DISTRESSED", signal: COERCED },
  { label: "CONTEXT MISMATCH (mobile + ASIA)", signal: CONTEXT_MISMATCH },
  { label: "BOT / AUTOMATED INPUT", signal: BOT_FAST },
];

console.log("=".repeat(72));
console.log("   ARES MODEL VERIFICATION — Baseline Rule + ML Anomaly Classifier");
console.log("=".repeat(72));

for (const { label, signal } of vectors) {
  const baseline = evaluateBaselineRule(signal);
  const ml = evaluateMLModel(signal);

  console.log(`\n── ${label} ──`);
  console.log(
    `  Baseline: risk=${baseline.riskScore.toFixed(2)} trust=${baseline.trustScore.toFixed(2)} conf=${baseline.confidence.toFixed(2)} decision=${baseline.decision}`
  );
  console.log(
    `  ML Model: risk=${ml.riskScore.toFixed(2)} trust=${ml.trustScore.toFixed(2)} conf=${ml.confidence.toFixed(2)} decision=${ml.decision}`
  );
}

// ── Assertions ──
const bl = evaluateBaselineRule(LEGITIMATE);
const ml = evaluateMLModel(LEGITIMATE);
const assertions: [string, boolean][] = [
  ["Legitimate → Baseline decision = NORMAL", bl.decision === "NORMAL"],
  ["Legitimate → ML decision = NORMAL", ml.decision === "NORMAL"],
  ["Legitimate → Baseline riskScore < 0.1", bl.riskScore < 0.1],
  ["Legitimate → ML riskScore < 0.15", ml.riskScore < 0.15],
  ["Coerced → Baseline decision ≠ NORMAL", evaluateBaselineRule(COERCED).decision !== "NORMAL"],
  ["Coerced → ML decision ≠ NORMAL", evaluateMLModel(COERCED).decision !== "NORMAL"],
  ["Context mismatch → Baseline riskScore > 0.5", evaluateBaselineRule(CONTEXT_MISMATCH).riskScore > 0.5],
  ["Bot → Baseline riskScore > 0.4", evaluateBaselineRule(BOT_FAST).riskScore > 0.4],
];

console.log("\n" + "=".repeat(72));
console.log("   ASSERTION RESULTS");
console.log("=".repeat(72));

let allPassed = true;
for (const [desc, passed] of assertions) {
  console.log(`  ${passed ? "✓ PASS" : "✗ FAIL"}: ${desc}`);
  if (!passed) allPassed = false;
}

console.log("\n" + "=".repeat(72));
console.log(allPassed ? "   ALL ASSERTIONS PASSED ✓" : "   SOME ASSERTIONS FAILED ✗");
console.log("=".repeat(72));

if (!allPassed) process.exit(1);
