/* ── A3.5: Adversarial Robustness Suite ────────────────────────────────
   Tests each ARES model's resilience to adversarial evasion:
     1. Blind adversary: gradient-free perturbation from anomalous
        profiles toward the NORMAL centroid.
     2. White-box adversary: knows model thresholds/weights and
        optimizes feature vectors to minimize risk scores.

   Measures evasion rate = fraction of adversarial samples that
   produce a NORMAL decision despite being derived from anomalous bases.

   Usage:  npx tsx src/evaluation/adversarial-suite.ts
   ──────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "fs";
import { join } from "path";
import {
  evaluateBaselineRule,
  evaluateMLModel,
  evaluateNeuralModel,
  constLegitBaseline,
  type BehavioralSignalInput,
  type ScorerResult,
} from "../services/ares.service";

// ── Types ────────────────────────────────────────────────────────────
type Scorer = (s: BehavioralSignalInput) => ScorerResult;

interface AdversarialResult {
  modelName: string;
  attack: string;
  totalAttempts: number;
  evasions: number;
  evasionRate: number;
  avgStepsToEvade: number | null;
  sampleTrajectories: { steps: number; finalRisk: number; evaded: boolean }[];
}

// ── PRNG for adversarial perturbation ────────────────────────────────
let advRng = 31337;
function advRandom(): number {
  let t = (advRng += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── Anomalous base profiles ─────────────────────────────────────────
const ANOMALOUS_BASES: { name: string; signal: BehavioralSignalInput }[] = [
  {
    name: "COERCED",
    signal: {
      dwellTimeMs: 200, flightTimeMs: 450, typingSpeedCpm: 80, correctionRate: 0.35,
      context: { deviceType: "desktop", locationCoarse: "US-EAST" },
    },
  },
  {
    name: "BOT",
    signal: {
      dwellTimeMs: 50, flightTimeMs: 30, typingSpeedCpm: 600, correctionRate: 0.0,
      context: { deviceType: "desktop", locationCoarse: "US-EAST" },
    },
  },
  {
    name: "CONTEXT_MISMATCH",
    signal: {
      dwellTimeMs: 115, flightTimeMs: 180, typingSpeedCpm: 240, correctionRate: 0.06,
      context: { deviceType: "mobile", locationCoarse: "EU-WEST" },
    },
  },
];

// The "ideal" legitimate profile the adversary tries to reach
const LEGIT_TARGET: BehavioralSignalInput = {
  dwellTimeMs: constLegitBaseline.dwellTimeMs.mean,
  flightTimeMs: constLegitBaseline.flightTimeMs.mean,
  typingSpeedCpm: constLegitBaseline.typingSpeedCpm.mean,
  correctionRate: constLegitBaseline.correctionRate.mean,
  context: {
    deviceType: constLegitBaseline.context.deviceType,
    locationCoarse: constLegitBaseline.context.locationCoarse,
  },
};

// ── Blind adversary: iterative feature interpolation ─────────────────
function blindAttack(
  base: BehavioralSignalInput,
  scorer: Scorer,
  maxSteps: number = 50
): { evaded: boolean; steps: number; finalRisk: number; trajectory: number[] } {
  let current = { ...base, context: { ...base.context } };
  const trajectory: number[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const result = scorer(current);
    trajectory.push(result.riskScore);

    if (result.decision === "NORMAL") {
      return { evaded: true, steps: step, finalRisk: result.riskScore, trajectory };
    }

    // Move 10% toward the legitimate target + small random perturbation
    const alpha = 0.1;
    const noise = () => (advRandom() - 0.5) * 5;

    current = {
      dwellTimeMs: current.dwellTimeMs! * (1 - alpha) + LEGIT_TARGET.dwellTimeMs! * alpha + noise(),
      flightTimeMs: current.flightTimeMs! * (1 - alpha) + LEGIT_TARGET.flightTimeMs! * alpha + noise(),
      typingSpeedCpm: current.typingSpeedCpm! * (1 - alpha) + LEGIT_TARGET.typingSpeedCpm! * alpha + noise(),
      correctionRate: Math.max(0, current.correctionRate! * (1 - alpha) + LEGIT_TARGET.correctionRate! * alpha + (advRandom() - 0.5) * 0.01),
      context: current.context, // Don't change context (adversary doesn't know correct device/location)
    };
  }

  const finalResult = scorer(current);
  trajectory.push(finalResult.riskScore);
  return { evaded: finalResult.decision === "NORMAL", steps: maxSteps, finalRisk: finalResult.riskScore, trajectory };
}

// ── White-box adversary: direct feature optimization ─────────────────
function whiteBoxAttack(
  base: BehavioralSignalInput,
  scorer: Scorer,
  maxSteps: number = 100
): { evaded: boolean; steps: number; finalRisk: number; trajectory: number[] } {
  // White-box: adversary knows to set behavioral features to exact baseline and correct context
  let current: BehavioralSignalInput = {
    dwellTimeMs: base.dwellTimeMs,
    flightTimeMs: base.flightTimeMs,
    typingSpeedCpm: base.typingSpeedCpm,
    correctionRate: base.correctionRate,
    context: { ...base.context },
  };
  const trajectory: number[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const result = scorer(current);
    trajectory.push(result.riskScore);

    if (result.decision === "NORMAL") {
      return { evaded: true, steps: step, finalRisk: result.riskScore, trajectory };
    }

    // Aggressive: move 30% toward legitimate baseline + fix context
    const alpha = 0.3;
    current = {
      dwellTimeMs: current.dwellTimeMs! * (1 - alpha) + LEGIT_TARGET.dwellTimeMs! * alpha,
      flightTimeMs: current.flightTimeMs! * (1 - alpha) + LEGIT_TARGET.flightTimeMs! * alpha,
      typingSpeedCpm: current.typingSpeedCpm! * (1 - alpha) + LEGIT_TARGET.typingSpeedCpm! * alpha,
      correctionRate: current.correctionRate! * (1 - alpha) + LEGIT_TARGET.correctionRate! * alpha,
      context: {
        deviceType: LEGIT_TARGET.context!.deviceType,    // White-box knows correct context
        locationCoarse: LEGIT_TARGET.context!.locationCoarse,
      },
    };
  }

  const finalResult = scorer(current);
  trajectory.push(finalResult.riskScore);
  return { evaded: finalResult.decision === "NORMAL", steps: maxSteps, finalRisk: finalResult.riskScore, trajectory };
}

// ── Main ─────────────────────────────────────────────────────────────
console.log("=".repeat(76));
console.log("  A3.5 — ADVERSARIAL ROBUSTNESS SUITE");
console.log("=".repeat(76));
console.log();

const N_TRIALS = 100; // Trials per base profile per attack
const scorers: { name: string; fn: Scorer }[] = [
  { name: "Baseline Rule Model", fn: evaluateBaselineRule },
  { name: "ML Anomaly Classifier", fn: evaluateMLModel },
  { name: "Neural-Net Scorer", fn: evaluateNeuralModel },
];

const attacks: { name: string; fn: typeof blindAttack }[] = [
  { name: "Blind (interpolation + noise)", fn: blindAttack },
  { name: "White-box (optimal interpolation)", fn: whiteBoxAttack },
];

const allResults: AdversarialResult[] = [];

for (const { name: attackName, fn: attackFn } of attacks) {
  console.log(`  ── ${attackName.toUpperCase()} ──`);

  for (const { name: modelName, fn: scorerFn } of scorers) {
    let totalAttempts = 0;
    let totalEvasions = 0;
    let totalSteps = 0;
    let stepsCount = 0;
    const trajectories: { steps: number; finalRisk: number; evaded: boolean }[] = [];

    for (const base of ANOMALOUS_BASES) {
      for (let trial = 0; trial < N_TRIALS; trial++) {
        advRng = 31337 + trial * 7 + ANOMALOUS_BASES.indexOf(base) * 1000;
        const result = attackFn(base.signal, scorerFn);
        totalAttempts++;
        if (result.evaded) {
          totalEvasions++;
          totalSteps += result.steps;
          stepsCount++;
        }
        if (trial < 3) { // Save first 3 trajectories per base for reporting
          trajectories.push({
            steps: result.steps,
            finalRisk: Math.round(result.finalRisk * 1000) / 1000,
            evaded: result.evaded,
          });
        }
      }
    }

    const evasionRate = Math.round((totalEvasions / totalAttempts) * 10000) / 10000;
    const avgSteps = stepsCount > 0 ? Math.round((totalSteps / stepsCount) * 10) / 10 : null;

    allResults.push({
      modelName,
      attack: attackName,
      totalAttempts,
      evasions: totalEvasions,
      evasionRate,
      avgStepsToEvade: avgSteps,
      sampleTrajectories: trajectories.slice(0, 9),
    });

    console.log(`    ${modelName.padEnd(24)} evasion=${(evasionRate * 100).toFixed(1)}%  (${totalEvasions}/${totalAttempts})${avgSteps !== null ? `  avgSteps=${avgSteps}` : ""}`);
  }
  console.log();
}

// Summary table
console.log(`${"─".repeat(76)}`);
console.log("  ADVERSARIAL ROBUSTNESS SUMMARY");
console.log(`${"─".repeat(76)}`);
console.log(`  ${"Model".padEnd(24)} ${"Blind".padStart(12)} ${"White-box".padStart(12)}`);
console.log(`  ${"─".repeat(50)}`);

for (const model of scorers) {
  const blind = allResults.find((r) => r.modelName === model.name && r.attack.includes("Blind"));
  const wb = allResults.find((r) => r.modelName === model.name && r.attack.includes("White-box"));
  console.log(
    `  ${model.name.padEnd(24)} ${((blind?.evasionRate ?? 0) * 100).toFixed(1).padStart(11)}% ${((wb?.evasionRate ?? 0) * 100).toFixed(1).padStart(11)}%`
  );
}

// Save
const outputPath = join(__dirname, "..", "..", "..", "docs", "adversarial-results.json");
writeFileSync(outputPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  configuration: {
    trialsPerBasePerAttack: N_TRIALS,
    anomalousBases: ANOMALOUS_BASES.map((b) => b.name),
    totalAttemptsPerModelPerAttack: N_TRIALS * ANOMALOUS_BASES.length,
  },
  results: allResults,
}, null, 2), "utf-8");
console.log(`\n  ✓ Results saved to docs/adversarial-results.json`);
console.log("=".repeat(76));
