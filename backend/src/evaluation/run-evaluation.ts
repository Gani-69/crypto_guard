/* ── Block G: ARES Model Evaluation — CLI Runner ──────────────────────
   Generates synthetic dataset → evaluates both models → prints report
   → saves results JSON for the Block H writeup.

   Usage:  npx tsx src/evaluation/run-evaluation.ts
   ──────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "fs";
import { join } from "path";
import { generateSyntheticDataset } from "./synthetic-dataset";
import { evaluateModels, type ModelMetrics, type EvaluationResult } from "./evaluate-models";

// ── Config ───────────────────────────────────────────────────────────
const SAMPLES_PER_CATEGORY = 200;

// ── Generate ─────────────────────────────────────────────────────────
console.log("=".repeat(76));
console.log("  BLOCK G — ARES MODEL EVALUATION & BENCHMARK");
console.log("  Baseline Rule Model vs. ML Anomaly Classifier");
console.log("=".repeat(76));
console.log();

console.log(`[1/3] Generating synthetic behavioral dataset...`);
console.log(`      ${SAMPLES_PER_CATEGORY} samples × 5 categories = ${SAMPLES_PER_CATEGORY * 5} total samples`);
console.log(`      Categories: LEGITIMATE, MILD_DRIFT (→ NORMAL)  |  COERCED, CONTEXT_MISMATCH, BOT (→ ANOMALOUS)`);

const dataset = generateSyntheticDataset({ samplesPerCategory: SAMPLES_PER_CATEGORY });
console.log(`      ✓ Dataset generated (${dataset.length} samples, shuffled)\n`);

// ── Evaluate ─────────────────────────────────────────────────────────
console.log(`[2/3] Running evaluation against both ARES models...`);
const results: EvaluationResult = evaluateModels(dataset);
console.log(`      ✓ Evaluation complete\n`);

// ── Report ───────────────────────────────────────────────────────────
console.log(`[3/3] Results\n`);

// Helper
function pct(v: number): string {
  return (v * 100).toFixed(2) + "%";
}

function printMetrics(m: ModelMetrics) {
  console.log(`  ┌─────────────────────────────────────────────┐`);
  console.log(`  │  ${m.modelName.padEnd(41)} │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  console.log(`  │  Accuracy:            ${pct(m.accuracy).padStart(10)}           │`);
  console.log(`  │  Precision:           ${pct(m.precision).padStart(10)}           │`);
  console.log(`  │  Recall:              ${pct(m.recall).padStart(10)}           │`);
  console.log(`  │  F1-Score:            ${pct(m.f1Score).padStart(10)}           │`);
  console.log(`  │  False Positive Rate: ${pct(m.falsePositiveRate).padStart(10)}           │`);
  console.log(`  │  False Negative Rate: ${pct(m.falseNegativeRate).padStart(10)}           │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  console.log(`  │  Confusion Matrix:                         │`);
  console.log(`  │    TP: ${String(m.confusion.tp).padStart(4)}   FP: ${String(m.confusion.fp).padStart(4)}                    │`);
  console.log(`  │    FN: ${String(m.confusion.fn).padStart(4)}   TN: ${String(m.confusion.tn).padStart(4)}                    │`);
  console.log(`  └─────────────────────────────────────────────┘`);
}

printMetrics(results.baseline);
console.log();
printMetrics(results.ml);

// ── Comparison table ─────────────────────────────────────────────────
console.log(`\n${"─".repeat(76)}`);
console.log("  HEAD-TO-HEAD COMPARISON");
console.log(`${"─".repeat(76)}`);

const metrics: [string, (m: ModelMetrics) => string][] = [
  ["Accuracy", (m) => pct(m.accuracy)],
  ["Precision", (m) => pct(m.precision)],
  ["Recall", (m) => pct(m.recall)],
  ["F1-Score", (m) => pct(m.f1Score)],
  ["False Positive Rate", (m) => pct(m.falsePositiveRate)],
  ["False Negative Rate", (m) => pct(m.falseNegativeRate)],
];

console.log(`  ${"Metric".padEnd(24)} ${"Baseline Rule".padStart(14)} ${"ML Classifier".padStart(14)}   Winner`);
console.log(`  ${"─".repeat(70)}`);

for (const [label, extractor] of metrics) {
  const blVal = extractor(results.baseline);
  const mlVal = extractor(results.ml);

  // Determine winner (higher is better for accuracy/precision/recall/F1, lower for FPR/FNR)
  const isLowerBetter = label.includes("Rate");
  let winner = "";
  const blNum = parseFloat(blVal);
  const mlNum = parseFloat(mlVal);
  if (Math.abs(blNum - mlNum) < 0.01) {
    winner = "≈ Tied";
  } else if (isLowerBetter) {
    winner = blNum < mlNum ? "← Baseline" : "ML →";
  } else {
    winner = blNum > mlNum ? "← Baseline" : "ML →";
  }

  console.log(`  ${label.padEnd(24)} ${blVal.padStart(14)} ${mlVal.padStart(14)}   ${winner}`);
}

// ── Per-category breakdown ───────────────────────────────────────────
console.log(`\n${"─".repeat(76)}`);
console.log("  PER-CATEGORY DECISION DISTRIBUTION");
console.log(`${"─".repeat(76)}`);

for (const cat of results.categoryBreakdowns) {
  const groundTruth = ["LEGITIMATE", "MILD_DRIFT"].includes(cat.category) ? "NORMAL" : "ANOMALOUS";
  console.log(`\n  ── ${cat.category} (ground truth: ${groundTruth}, n=${cat.totalSamples}) ──`);

  console.log(`    Baseline Rule:  ${formatDecisionDist(cat.baselineDecisions, cat.totalSamples)}`);
  console.log(`    ML Classifier:  ${formatDecisionDist(cat.mlDecisions, cat.totalSamples)}`);
}

function formatDecisionDist(dist: Record<string, number>, total: number): string {
  const ordered = ["NORMAL", "STEP_UP", "RESTRICTED", "SHADOW"];
  return ordered
    .filter((k) => dist[k])
    .map((k) => `${k}=${dist[k]} (${((dist[k] / total) * 100).toFixed(1)}%)`)
    .join("  ");
}

// ── Save results ─────────────────────────────────────────────────────
// Strip individual predictions for the summary file (too large)
const summaryResults = { ...results };
delete (summaryResults as any).samplePredictions;

// docs/ is at the project root: backend/src/evaluation/../../.. = project root
const outputPath = join(__dirname, "..", "..", "..", "docs", "evaluation-results.json");
writeFileSync(outputPath, JSON.stringify(summaryResults, null, 2), "utf-8");
console.log(`\n${"─".repeat(76)}`);
console.log(`  Results saved to: docs/evaluation-results.json`);
console.log(`${"═".repeat(76)}`);
