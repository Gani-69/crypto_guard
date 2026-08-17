/* ── A3.2: Statistical Significance Testing ───────────────────────────
   Runs the evaluation N=30 times with different seeds (1–30), collects
   per-model F1/accuracy/FPR/FNR, then computes:
     - Mean ± std for each metric/model
     - Paired t-test between each model pair on each metric
     - Cohen's d effect sizes

   Seeds 1–30 are STRICTLY DISJOINT from neural-net training seeds
   (1000–1099). This ensures the comparison is methodologically valid.

   Usage:  npx tsx src/evaluation/statistical-tests.ts
   ──────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "fs";
import { join } from "path";
import { generateSyntheticDataset } from "./synthetic-dataset";
import { evaluateModels, type ModelMetrics } from "./evaluate-models";

// ── Configuration ────────────────────────────────────────────────────
const N_RUNS = 30;
const EVAL_SEEDS = Array.from({ length: N_RUNS }, (_, i) => i + 1); // seeds 1–30
const SAMPLES_PER_CAT = 200;

// ── Statistics helpers ───────────────────────────────────────────────
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function pairedTTest(a: number[], b: number[]): { t: number; p: number; df: number } {
  const n = a.length;
  const diffs = a.map((v, i) => v - b[i]);
  const dMean = mean(diffs);
  const dStd = std(diffs);
  const se = dStd / Math.sqrt(n);
  const t = se > 0 ? dMean / se : 0;
  const df = n - 1;

  // Two-tailed p-value approximation using t-distribution
  // Using the approximation: p ≈ 2 * (1 - Φ(|t| * sqrt(df/(df + t²))))
  // For large df this is close; for df=29 it's reasonable
  const absT = Math.abs(t);
  const x = df / (df + absT * absT);
  // Regularized incomplete beta function approximation for p-value
  // Using a simpler normal approximation for df >= 20
  const z = absT * Math.sqrt(1 - 1 / (4 * df) - 7 / (120 * df * df));
  const p = 2 * (1 - normalCDF(z));

  return { t: round(t), p: round(p, 6), df };
}

function normalCDF(z: number): number {
  // Abramowitz & Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function cohensD(a: number[], b: number[]): number {
  const mA = mean(a), mB = mean(b);
  const sA = std(a), sB = std(b);
  const pooledStd = Math.sqrt(((a.length - 1) * sA * sA + (b.length - 1) * sB * sB) / (a.length + b.length - 2));
  return pooledStd > 0 ? round((mA - mB) / pooledStd) : 0;
}

function round(v: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

// ── Metric extraction ────────────────────────────────────────────────
type MetricExtractor = (m: ModelMetrics) => number;

const METRICS: { name: string; extract: MetricExtractor }[] = [
  { name: "accuracy", extract: (m) => m.accuracy },
  { name: "f1Score", extract: (m) => m.f1Score },
  { name: "precision", extract: (m) => m.precision },
  { name: "recall", extract: (m) => m.recall },
  { name: "falsePositiveRate", extract: (m) => m.falsePositiveRate },
  { name: "falseNegativeRate", extract: (m) => m.falseNegativeRate },
];

// ── Main ─────────────────────────────────────────────────────────────
console.log("=".repeat(76));
console.log("  A3.2 — STATISTICAL SIGNIFICANCE TESTING");
console.log(`  N=${N_RUNS} runs, seeds 1–${N_RUNS} (disjoint from neural training seeds 1000–1099)`);
console.log("=".repeat(76));
console.log();

// Collect metrics across runs
const baselineRuns: ModelMetrics[] = [];
const mlRuns: ModelMetrics[] = [];
const neuralRuns: ModelMetrics[] = [];

console.log("[1/3] Running evaluations across 30 seeds...");
for (let i = 0; i < N_RUNS; i++) {
  const seed = EVAL_SEEDS[i];
  const dataset = generateSyntheticDataset({ samplesPerCategory: SAMPLES_PER_CAT, seed });
  const result = evaluateModels(dataset);
  baselineRuns.push(result.baseline);
  mlRuns.push(result.ml);
  neuralRuns.push(result.neural);

  if ((i + 1) % 10 === 0) {
    console.log(`      ✓ ${i + 1}/${N_RUNS} runs complete`);
  }
}
console.log();

// Compute descriptive statistics
console.log("[2/3] Computing statistics...\n");

interface ModelStats {
  modelName: string;
  metrics: {
    [key: string]: { mean: number; std: number; values: number[] };
  };
}

function computeStats(name: string, runs: ModelMetrics[]): ModelStats {
  const stats: ModelStats = { modelName: name, metrics: {} };
  for (const { name: metricName, extract } of METRICS) {
    const values = runs.map(extract);
    stats.metrics[metricName] = {
      mean: round(mean(values)),
      std: round(std(values)),
      values,
    };
  }
  return stats;
}

const baselineStats = computeStats("Baseline Rule Model", baselineRuns);
const mlStats = computeStats("ML Anomaly Classifier", mlRuns);
const neuralStats = computeStats("Neural-Net Scorer", neuralRuns);

// Print descriptive stats
console.log("  DESCRIPTIVE STATISTICS (mean ± std over 30 runs)");
console.log(`  ${"─".repeat(72)}`);
console.log(`  ${"Metric".padEnd(22)} ${"Baseline".padStart(16)} ${"ML".padStart(16)} ${"Neural".padStart(16)}`);
console.log(`  ${"─".repeat(72)}`);

for (const { name: metricName } of METRICS) {
  const bl = baselineStats.metrics[metricName];
  const ml = mlStats.metrics[metricName];
  const nn = neuralStats.metrics[metricName];
  const fmt = (s: { mean: number; std: number }) => `${(s.mean * 100).toFixed(2)}±${(s.std * 100).toFixed(2)}%`;
  console.log(`  ${metricName.padEnd(22)} ${fmt(bl).padStart(16)} ${fmt(ml).padStart(16)} ${fmt(nn).padStart(16)}`);
}

// Pairwise comparisons
console.log(`\n  PAIRWISE COMPARISONS (paired t-test, two-tailed)`);
console.log(`  ${"─".repeat(72)}`);

interface PairwiseResult {
  metric: string;
  pair: string;
  t: number;
  p: number;
  df: number;
  cohensD: number;
  significant: boolean;
}

const pairwise: PairwiseResult[] = [];
const modelPairs: { name: string; a: ModelStats; b: ModelStats }[] = [
  { name: "Baseline vs ML", a: baselineStats, b: mlStats },
  { name: "Baseline vs Neural", a: baselineStats, b: neuralStats },
  { name: "ML vs Neural", a: mlStats, b: neuralStats },
];

console.log(`  ${"Metric".padEnd(22)} ${"Pair".padEnd(20)} ${"t".padStart(8)} ${"p".padStart(10)} ${"d".padStart(8)} ${"Sig?".padStart(6)}`);
console.log(`  ${"─".repeat(72)}`);

for (const { name: metricName } of METRICS) {
  for (const { name: pairName, a, b } of modelPairs) {
    const aVals = a.metrics[metricName].values;
    const bVals = b.metrics[metricName].values;
    const test = pairedTTest(aVals, bVals);
    const d = cohensD(aVals, bVals);
    const sig = test.p < 0.05;

    pairwise.push({
      metric: metricName,
      pair: pairName,
      t: test.t,
      p: test.p,
      df: test.df,
      cohensD: d,
      significant: sig,
    });

    console.log(
      `  ${metricName.padEnd(22)} ${pairName.padEnd(20)} ${test.t.toFixed(3).padStart(8)} ${test.p.toFixed(6).padStart(10)} ${d.toFixed(3).padStart(8)} ${(sig ? "  Yes*" : "    No").padStart(6)}`
    );
  }
}

// Save results
console.log("\n[3/3] Saving results...");

const output = {
  timestamp: new Date().toISOString(),
  configuration: {
    nRuns: N_RUNS,
    seeds: EVAL_SEEDS,
    samplesPerCategory: SAMPLES_PER_CAT,
    neuralTrainingSeeds: "1000–1099 (disjoint)",
  },
  descriptiveStatistics: {
    baseline: Object.fromEntries(
      Object.entries(baselineStats.metrics).map(([k, v]) => [k, { mean: v.mean, std: v.std }])
    ),
    ml: Object.fromEntries(
      Object.entries(mlStats.metrics).map(([k, v]) => [k, { mean: v.mean, std: v.std }])
    ),
    neural: Object.fromEntries(
      Object.entries(neuralStats.metrics).map(([k, v]) => [k, { mean: v.mean, std: v.std }])
    ),
  },
  pairwiseComparisons: pairwise,
};

const outputPath = join(__dirname, "..", "..", "..", "docs", "statistical-results.json");
writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
console.log(`      ✓ Saved to docs/statistical-results.json`);
console.log("=".repeat(76));
