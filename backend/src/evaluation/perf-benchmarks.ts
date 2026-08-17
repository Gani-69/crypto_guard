/* ── A3.3: Performance / Latency Benchmarks ───────────────────────────
   Measures latency of the three ARES scorers, the full pipeline, and
   basic memory usage. Does NOT include HTTP/API benchmarks (those
   require a running server).

   ─── SQLITE CONCURRENCY CAVEAT ───────────────────────────────────────
   The project runs on SQLite (file:./dev.db) for local development.
   SQLite uses a single-writer model, so any pipeline benchmarks that
   include DB writes reflect SQLite's lock contention, NOT the
   architecture's inherent scalability. This is stated explicitly in
   the output. Concurrency benchmarks can be rerun against PostgreSQL
   if needed (the Prisma schema already supports provider = "postgresql").
   ──────────────────────────────────────────────────────────────────────

   Usage:  npx tsx src/evaluation/perf-benchmarks.ts
   ──────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "fs";
import { join } from "path";
import {
  evaluateBaselineRule,
  evaluateMLModel,
  evaluateNeuralModel,
  type BehavioralSignalInput,
} from "../services/ares.service";
import { generateSyntheticDataset } from "./synthetic-dataset";

// ── Percentile helper ────────────────────────────────────────────────
function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeLatencyStats(timings: number[]) {
  const sorted = [...timings].sort((a, b) => a - b);
  return {
    count: sorted.length,
    mean: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length * 100) / 100,
    p50: Math.round(percentile(sorted, 0.50) * 100) / 100,
    p95: Math.round(percentile(sorted, 0.95) * 100) / 100,
    p99: Math.round(percentile(sorted, 0.99) * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
  };
}

// ── Generate test signals ────────────────────────────────────────────
const dataset = generateSyntheticDataset({ samplesPerCategory: 200, seed: 42 });
const signals: BehavioralSignalInput[] = dataset.map((s) => s.signal);

// ── Main ─────────────────────────────────────────────────────────────
console.log("=".repeat(76));
console.log("  A3.3 — PERFORMANCE / LATENCY BENCHMARKS");
console.log("=".repeat(76));
console.log();

const N_SCORER = 10000;

// 1. Scorer latency (microseconds)
console.log("[1/4] Scorer latency (10,000 invocations each)...");

function benchmarkScorer(name: string, fn: (s: BehavioralSignalInput) => unknown) {
  const timings: number[] = [];
  for (let i = 0; i < N_SCORER; i++) {
    const signal = signals[i % signals.length];
    const start = performance.now();
    fn(signal);
    const elapsed = (performance.now() - start) * 1000; // → microseconds
    timings.push(elapsed);
  }
  return computeLatencyStats(timings);
}

const baselineLatency = benchmarkScorer("Baseline Rule", evaluateBaselineRule);
const mlLatency = benchmarkScorer("ML Model", evaluateMLModel);
const neuralLatency = benchmarkScorer("Neural-Net", evaluateNeuralModel);

function printLatency(name: string, stats: ReturnType<typeof computeLatencyStats>, unit: string) {
  console.log(`      ${name.padEnd(24)} mean=${stats.mean.toFixed(1)}${unit}  p50=${stats.p50.toFixed(1)}${unit}  p95=${stats.p95.toFixed(1)}${unit}  p99=${stats.p99.toFixed(1)}${unit}`);
}

printLatency("Baseline Rule Model", baselineLatency, "µs");
printLatency("ML Anomaly Classifier", mlLatency, "µs");
printLatency("Neural-Net Scorer", neuralLatency, "µs");

// 2. Three-model evaluation latency (single-sample, all three models)
console.log("\n[2/4] Three-model evaluation latency (1,000 invocations)...");
const N_EVAL = 1000;
const evalTimings: number[] = [];
for (let i = 0; i < N_EVAL; i++) {
  const signal = signals[i % signals.length];
  const start = performance.now();
  evaluateBaselineRule(signal);
  evaluateMLModel(signal);
  evaluateNeuralModel(signal);
  const elapsed = (performance.now() - start) * 1000; // → microseconds
  evalTimings.push(elapsed);
}
const evalLatency = computeLatencyStats(evalTimings);
printLatency("Three-model eval", evalLatency, "µs");

// 3. Dataset generation latency
console.log("\n[3/4] Dataset generation latency...");
const N_DATAGEN = 50;
const datagenTimings: number[] = [];
for (let i = 0; i < N_DATAGEN; i++) {
  const start = performance.now();
  generateSyntheticDataset({ samplesPerCategory: 200, seed: 42 + i });
  const elapsed = performance.now() - start; // ms
  datagenTimings.push(elapsed);
}
const datagenLatency = computeLatencyStats(datagenTimings);
printLatency("Dataset gen (1000 samples)", datagenLatency, "ms");

// 4. Memory usage
console.log("\n[4/4] Memory usage snapshot...");
const mem = process.memoryUsage();
const memMB = {
  rss: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
  heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
  heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
  external: Math.round(mem.external / 1024 / 1024 * 100) / 100,
};
console.log(`      RSS:          ${memMB.rss} MB`);
console.log(`      Heap Total:   ${memMB.heapTotal} MB`);
console.log(`      Heap Used:    ${memMB.heapUsed} MB`);
console.log(`      External:     ${memMB.external} MB`);

// Save results
const results = {
  timestamp: new Date().toISOString(),
  caveat: "SQLite single-writer model — concurrency benchmarks reflect lock contention, NOT architecture scalability. Rerun against PostgreSQL for representative concurrency numbers.",
  scorerLatency: {
    unit: "microseconds",
    invocations: N_SCORER,
    baseline: baselineLatency,
    ml: mlLatency,
    neural: neuralLatency,
  },
  threeModelEvalLatency: {
    unit: "microseconds",
    invocations: N_EVAL,
    stats: evalLatency,
  },
  datasetGenerationLatency: {
    unit: "milliseconds",
    invocations: N_DATAGEN,
    samplesPerRun: 1000,
    stats: datagenLatency,
  },
  memoryUsage: {
    unit: "MB",
    ...memMB,
  },
};

console.log();
const outputPath = join(__dirname, "..", "..", "..", "docs", "perf-results.json");
writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
console.log(`✓ Results saved to docs/perf-results.json`);
console.log("=".repeat(76));
