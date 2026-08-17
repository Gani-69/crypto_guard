/* ── A3.1: ROC-AUC Analysis ───────────────────────────────────────────
   Sweeps risk-score thresholds from 0.0 to 1.0 (step 0.01) for each
   of the three ARES models. Computes TPR, FPR at each threshold, then
   integrates the ROC curve via the trapezoidal rule to produce AUC.

   Uses evaluation seed 42 (disjoint from neural training seeds 1000–1099).

   Usage:  npx tsx src/evaluation/roc-analysis.ts
   ──────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "fs";
import { join } from "path";
import { generateSyntheticDataset, type LabeledSample } from "./synthetic-dataset";
import {
  evaluateBaselineRule,
  evaluateMLModel,
  evaluateNeuralModel,
  type BehavioralSignalInput,
} from "../services/ares.service";

// ── Types ────────────────────────────────────────────────────────────
interface ROCPoint {
  threshold: number;
  tpr: number;
  fpr: number;
}

interface ModelROC {
  modelName: string;
  auc: number;
  curve: ROCPoint[];
}

interface ROCResults {
  timestamp: string;
  datasetSize: number;
  seed: number;
  thresholdSteps: number;
  models: ModelROC[];
}

// ── Scorer wrapper ───────────────────────────────────────────────────
type Scorer = (signal: BehavioralSignalInput) => number;

function makeScorers(): { name: string; scorer: Scorer }[] {
  return [
    { name: "Baseline Rule Model", scorer: (s) => evaluateBaselineRule(s).riskScore },
    { name: "ML Anomaly Classifier", scorer: (s) => evaluateMLModel(s).riskScore },
    { name: "Neural-Net Scorer", scorer: (s) => evaluateNeuralModel(s).riskScore },
  ];
}

// ── ROC computation ──────────────────────────────────────────────────
function computeROC(
  samples: LabeledSample[],
  scorer: Scorer,
  steps: number = 101
): ROCPoint[] {
  const thresholds: number[] = [];
  for (let i = 0; i < steps; i++) thresholds.push(i / (steps - 1));

  // Pre-compute risk scores
  const scored = samples.map((s) => ({
    label: s.label,
    risk: scorer(s.signal),
  }));

  const totalPositive = scored.filter((s) => s.label === "ANOMALOUS").length;
  const totalNegative = scored.filter((s) => s.label === "NORMAL").length;

  const curve: ROCPoint[] = [];

  for (const threshold of thresholds) {
    let tp = 0, fp = 0;
    for (const { label, risk } of scored) {
      const predicted = risk >= threshold ? "ANOMALOUS" : "NORMAL";
      if (predicted === "ANOMALOUS" && label === "ANOMALOUS") tp++;
      if (predicted === "ANOMALOUS" && label === "NORMAL") fp++;
    }
    const tpr = totalPositive > 0 ? tp / totalPositive : 0;
    const fpr = totalNegative > 0 ? fp / totalNegative : 0;
    curve.push({
      threshold: Math.round(threshold * 100) / 100,
      tpr: Math.round(tpr * 10000) / 10000,
      fpr: Math.round(fpr * 10000) / 10000,
    });
  }

  return curve;
}

function computeAUC(curve: ROCPoint[]): number {
  // Sort by FPR ascending for proper trapezoidal integration
  const sorted = [...curve].sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);

  // De-duplicate FPR values (keep max TPR at each FPR)
  const deduped: ROCPoint[] = [];
  for (const pt of sorted) {
    if (deduped.length === 0 || deduped[deduped.length - 1].fpr !== pt.fpr) {
      deduped.push(pt);
    } else {
      deduped[deduped.length - 1].tpr = Math.max(deduped[deduped.length - 1].tpr, pt.tpr);
    }
  }

  let auc = 0;
  for (let i = 1; i < deduped.length; i++) {
    const dx = deduped[i].fpr - deduped[i - 1].fpr;
    const avgY = (deduped[i].tpr + deduped[i - 1].tpr) / 2;
    auc += dx * avgY;
  }

  return Math.round(auc * 10000) / 10000;
}

// ── Main ─────────────────────────────────────────────────────────────
console.log("=".repeat(76));
console.log("  A3.1 — ROC-AUC ANALYSIS");
console.log("  Three-model threshold sweep (0.00 → 1.00, step 0.01)");
console.log("=".repeat(76));
console.log();

const EVAL_SEED = 42;
const SAMPLES_PER_CAT = 200;
const THRESHOLD_STEPS = 101; // 0.00, 0.01, ..., 1.00

console.log("[1/3] Generating dataset...");
const dataset = generateSyntheticDataset({ samplesPerCategory: SAMPLES_PER_CAT, seed: EVAL_SEED });
console.log(`      ✓ ${dataset.length} samples (seed ${EVAL_SEED})\n`);

console.log("[2/3] Computing ROC curves...");
const scorers = makeScorers();
const modelROCs: ModelROC[] = [];

for (const { name, scorer } of scorers) {
  const curve = computeROC(dataset, scorer, THRESHOLD_STEPS);
  const auc = computeAUC(curve);
  modelROCs.push({ modelName: name, auc, curve });
  console.log(`      ${name.padEnd(24)} AUC = ${auc.toFixed(4)}`);
}

console.log();

const results: ROCResults = {
  timestamp: new Date().toISOString(),
  datasetSize: dataset.length,
  seed: EVAL_SEED,
  thresholdSteps: THRESHOLD_STEPS,
  models: modelROCs,
};

console.log("[3/3] Saving results...");
const outputPath = join(__dirname, "..", "..", "..", "docs", "roc-results.json");
writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
console.log(`      ✓ Saved to docs/roc-results.json`);

// Summary table
console.log(`\n${"─".repeat(76)}`);
console.log("  ROC-AUC SUMMARY");
console.log(`${"─".repeat(76)}`);
console.log(`  ${"Model".padEnd(28)} AUC      Interpretation`);
console.log(`  ${"─".repeat(60)}`);
for (const m of modelROCs) {
  const interp = m.auc >= 0.99 ? "Outstanding" : m.auc >= 0.95 ? "Excellent" : m.auc >= 0.90 ? "Good" : m.auc >= 0.80 ? "Fair" : "Poor";
  console.log(`  ${m.modelName.padEnd(28)} ${m.auc.toFixed(4)}   ${interp}`);
}
console.log("=".repeat(76));
