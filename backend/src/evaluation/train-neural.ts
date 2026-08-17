/* ── Neural-Net ARES Model — Offline Training Script ───────────────────
   Trains a small feedforward neural network on synthetic behavioral data
   and exports the learned weight matrices to neural-weights.ts.

   Architecture: 6 inputs → 16 hidden (ReLU) → 8 hidden (ReLU) → 1 output (sigmoid)
   Inputs: [dwellTimeMs, flightTimeMs, typingSpeedCpm, correctionRate, deviceMismatch, locationMismatch]
   Output: risk score ∈ [0, 1]

   ─── DATA LEAKAGE PREVENTION (CRITICAL) ──────────────────────────────
   This script trains EXCLUSIVELY on seeds 1000–1099 from the synthetic
   dataset generator. Evaluation seeds (1–30 for statistical tests, 42
   for default single-run) are NEVER used here.

   Rationale: The neural net and the evaluation harness both consume
   samples from the same synthetic generator. If training and evaluation
   seeds overlap, the net trivially learns the generator's decision
   boundary — winning the comparison by having seen the answer key, not
   by being a better risk model. Strict seed separation ensures any
   observed advantage is a real architectural result.
   ──────────────────────────────────────────────────────────────────────

   Usage:  npx tsx src/evaluation/train-neural.ts
   ──────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "fs";
import { join } from "path";
import { generateSyntheticDataset } from "./synthetic-dataset";
import type { LabeledSample } from "./synthetic-dataset";
import { constLegitBaseline } from "../services/ares.service";

// ── Training configuration ──────────────────────────────────────────
const TRAINING_SEEDS = Array.from({ length: 100 }, (_, i) => 1000 + i); // 1000–1099
const SAMPLES_PER_SEED = 50; // 50 samples × 5 categories × 100 seeds = 25,000 training samples
const LEARNING_RATE = 0.05;
const EPOCHS = 200;
const BATCH_SIZE = 64;

// ── Network dimensions ──────────────────────────────────────────────
const INPUT_DIM = 6;   // dwellTime, flightTime, typingSpeed, correctionRate, deviceMismatch, locationMismatch
const HIDDEN1 = 16;
const HIDDEN2 = 8;
const OUTPUT_DIM = 1;

// ── Feature normalization (z-score against baseline) ────────────────
function extractFeatures(sample: LabeledSample): number[] {
  const s = sample.signal;
  const dwellZ = (s.dwellTimeMs ?? constLegitBaseline.dwellTimeMs.mean)
    / constLegitBaseline.dwellTimeMs.mean - 1;
  const flightZ = (s.flightTimeMs ?? constLegitBaseline.flightTimeMs.mean)
    / constLegitBaseline.flightTimeMs.mean - 1;
  const speedZ = (s.typingSpeedCpm ?? constLegitBaseline.typingSpeedCpm.mean)
    / constLegitBaseline.typingSpeedCpm.mean - 1;
  const corrZ = (s.correctionRate ?? constLegitBaseline.correctionRate.mean)
    / (constLegitBaseline.correctionRate.mean || 0.05) - 1;
  const deviceMismatch = (s.context?.deviceType && s.context.deviceType !== constLegitBaseline.context.deviceType) ? 1.0 : 0.0;
  const locationMismatch = (s.context?.locationCoarse && s.context.locationCoarse !== constLegitBaseline.context.locationCoarse) ? 1.0 : 0.0;

  return [dwellZ, flightZ, speedZ, corrZ, deviceMismatch, locationMismatch];
}

function extractLabel(sample: LabeledSample): number {
  return sample.label === "ANOMALOUS" ? 1.0 : 0.0;
}

// ── PRNG for weight initialization ──────────────────────────────────
let trainRngState = 7777;
function trainRng(): number {
  let t = (trainRngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function initWeight(): number {
  // Xavier initialization approximation
  return (trainRng() - 0.5) * 0.5;
}

// ── Network data structures ─────────────────────────────────────────
interface Layer {
  weights: number[][]; // [outputNeurons][inputNeurons]
  biases: number[];    // [outputNeurons]
}

function createLayer(inputSize: number, outputSize: number): Layer {
  const weights: number[][] = [];
  for (let o = 0; o < outputSize; o++) {
    const row: number[] = [];
    for (let i = 0; i < inputSize; i++) {
      row.push(initWeight());
    }
    weights.push(row);
  }
  const biases = new Array(outputSize).fill(0).map(() => initWeight() * 0.1);
  return { weights, biases };
}

// ── Activation functions ────────────────────────────────────────────
function relu(x: number): number { return Math.max(0, x); }
function sigmoid(x: number): number { return 1.0 / (1.0 + Math.exp(-x)); }
function reluDeriv(x: number): number { return x > 0 ? 1 : 0; }

// ── Forward pass ────────────────────────────────────────────────────
interface ForwardResult {
  z1: number[]; a1: number[]; // hidden layer 1
  z2: number[]; a2: number[]; // hidden layer 2
  z3: number; a3: number;     // output
}

function forward(input: number[], l1: Layer, l2: Layer, l3: Layer): ForwardResult {
  // Layer 1
  const z1: number[] = [];
  const a1: number[] = [];
  for (let j = 0; j < HIDDEN1; j++) {
    let sum = l1.biases[j];
    for (let i = 0; i < INPUT_DIM; i++) sum += l1.weights[j][i] * input[i];
    z1.push(sum);
    a1.push(relu(sum));
  }

  // Layer 2
  const z2: number[] = [];
  const a2: number[] = [];
  for (let j = 0; j < HIDDEN2; j++) {
    let sum = l2.biases[j];
    for (let i = 0; i < HIDDEN1; i++) sum += l2.weights[j][i] * a1[i];
    z2.push(sum);
    a2.push(relu(sum));
  }

  // Output layer
  let z3 = l3.biases[0];
  for (let i = 0; i < HIDDEN2; i++) z3 += l3.weights[0][i] * a2[i];
  const a3 = sigmoid(z3);

  return { z1, a1, z2, a2, z3, a3 };
}

// ── Backward pass + SGD update ──────────────────────────────────────
function backward(
  input: number[], label: number, fwd: ForwardResult,
  l1: Layer, l2: Layer, l3: Layer, lr: number
): number {
  const { a1, a2, z1, z2, a3 } = fwd;

  // Binary cross-entropy loss gradient
  const dLoss_da3 = -(label / (a3 + 1e-10)) + ((1 - label) / (1 - a3 + 1e-10));
  const da3_dz3 = a3 * (1 - a3); // sigmoid derivative
  const delta3 = dLoss_da3 * da3_dz3;

  // Output layer gradients
  for (let i = 0; i < HIDDEN2; i++) {
    l3.weights[0][i] -= lr * delta3 * a2[i];
  }
  l3.biases[0] -= lr * delta3;

  // Hidden layer 2 gradients
  const delta2: number[] = [];
  for (let j = 0; j < HIDDEN2; j++) {
    const upstream = delta3 * l3.weights[0][j];
    delta2.push(upstream * reluDeriv(z2[j]));
  }
  for (let j = 0; j < HIDDEN2; j++) {
    for (let i = 0; i < HIDDEN1; i++) {
      l2.weights[j][i] -= lr * delta2[j] * a1[i];
    }
    l2.biases[j] -= lr * delta2[j];
  }

  // Hidden layer 1 gradients
  const delta1: number[] = [];
  for (let j = 0; j < HIDDEN1; j++) {
    let upstream = 0;
    for (let k = 0; k < HIDDEN2; k++) upstream += delta2[k] * l2.weights[k][j];
    delta1.push(upstream * reluDeriv(z1[j]));
  }
  for (let j = 0; j < HIDDEN1; j++) {
    for (let i = 0; i < INPUT_DIM; i++) {
      l1.weights[j][i] -= lr * delta1[j] * input[i];
    }
    l1.biases[j] -= lr * delta1[j];
  }

  // Return binary cross-entropy loss for monitoring
  const eps = 1e-10;
  return -(label * Math.log(a3 + eps) + (1 - label) * Math.log(1 - a3 + eps));
}

// ── Shuffle helper ──────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(trainRng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Main training loop ──────────────────────────────────────────────
console.log("=".repeat(76));
console.log("  NEURAL-NET ARES MODEL — OFFLINE TRAINING");
console.log("  Architecture: 6 → 16 (ReLU) → 8 (ReLU) → 1 (Sigmoid)");
console.log("=".repeat(76));
console.log();

// 1. Generate training data from training-only seeds
console.log("[1/4] Generating training dataset...");
console.log(`      Seeds: 1000–1099 (TRAINING ONLY — disjoint from eval seeds 1–30, 42)`);

const allTrainingSamples: { features: number[]; label: number }[] = [];
for (const seed of TRAINING_SEEDS) {
  const dataset = generateSyntheticDataset({ samplesPerCategory: SAMPLES_PER_SEED, seed });
  for (const sample of dataset) {
    allTrainingSamples.push({
      features: extractFeatures(sample),
      label: extractLabel(sample),
    });
  }
}

console.log(`      ✓ Generated ${allTrainingSamples.length} training samples`);
const nPositive = allTrainingSamples.filter(s => s.label === 1).length;
const nNegative = allTrainingSamples.filter(s => s.label === 0).length;
console.log(`      Class balance: ${nPositive} anomalous, ${nNegative} normal\n`);

// 2. Initialize network
console.log("[2/4] Initializing network weights...");
const layer1 = createLayer(INPUT_DIM, HIDDEN1);
const layer2 = createLayer(HIDDEN1, HIDDEN2);
const layer3 = createLayer(HIDDEN2, OUTPUT_DIM);
console.log(`      ✓ Initialized (Xavier-approx) — ${INPUT_DIM}→${HIDDEN1}→${HIDDEN2}→${OUTPUT_DIM}\n`);

// 3. Train
console.log(`[3/4] Training for ${EPOCHS} epochs (batch size ${BATCH_SIZE}, lr ${LEARNING_RATE})...`);

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const shuffled = shuffle(allTrainingSamples);
  let epochLoss = 0;
  let correct = 0;

  for (let b = 0; b < shuffled.length; b += BATCH_SIZE) {
    const batchEnd = Math.min(b + BATCH_SIZE, shuffled.length);
    for (let i = b; i < batchEnd; i++) {
      const { features, label } = shuffled[i];
      const fwd = forward(features, layer1, layer2, layer3);
      epochLoss += backward(features, label, fwd, layer1, layer2, layer3, LEARNING_RATE);
      const predicted = fwd.a3 >= 0.5 ? 1 : 0;
      if (predicted === label) correct++;
    }
  }

  const avgLoss = epochLoss / shuffled.length;
  const accuracy = correct / shuffled.length;

  if (epoch % 20 === 0 || epoch === EPOCHS - 1) {
    console.log(`      Epoch ${String(epoch + 1).padStart(4)}/${EPOCHS}  loss=${avgLoss.toFixed(4)}  accuracy=${(accuracy * 100).toFixed(1)}%`);
  }
}

// 4. Compute final training metrics
let finalCorrect = 0;
let tp = 0, tn = 0, fp = 0, fn = 0;
for (const s of allTrainingSamples) {
  const fwd = forward(s.features, layer1, layer2, layer3);
  const pred = fwd.a3 >= 0.5 ? 1 : 0;
  if (pred === s.label) finalCorrect++;
  if (s.label === 1 && pred === 1) tp++;
  if (s.label === 0 && pred === 0) tn++;
  if (s.label === 0 && pred === 1) fp++;
  if (s.label === 1 && pred === 0) fn++;
}
const finalAccuracy = finalCorrect / allTrainingSamples.length;
console.log(`\n      Final training accuracy: ${(finalAccuracy * 100).toFixed(2)}%`);
console.log(`      TP=${tp} TN=${tn} FP=${fp} FN=${fn}`);

// 5. Export weights
console.log("\n[4/4] Exporting weights to neural-weights.ts...");

const weightsData = {
  layer1: { weights: layer1.weights, biases: layer1.biases },
  layer2: { weights: layer2.weights, biases: layer2.biases },
  layer3: { weights: layer3.weights, biases: layer3.biases },
};

const tsContent = `/* ── Pre-trained Neural-Net Weights ────────────────────────────────────
   Auto-generated by train-neural.ts on ${new Date().toISOString()}

   Architecture: 6 → 16 (ReLU) → 8 (ReLU) → 1 (Sigmoid)
   Training: ${allTrainingSamples.length} samples, seeds 1000–1099 (disjoint from eval seeds)
   Final training accuracy: ${(finalAccuracy * 100).toFixed(2)}%

   DO NOT EDIT MANUALLY — regenerate by running:
     npx tsx src/evaluation/train-neural.ts
   ──────────────────────────────────────────────────────────────────── */

export interface NeuralLayerWeights {
  weights: number[][];
  biases: number[];
}

export interface NeuralNetWeights {
  layer1: NeuralLayerWeights;
  layer2: NeuralLayerWeights;
  layer3: NeuralLayerWeights;
}

export const NEURAL_WEIGHTS: NeuralNetWeights = ${JSON.stringify(weightsData, null, 2)};
`;

const outputPath = join(__dirname, "..", "services", "neural-weights.ts");
writeFileSync(outputPath, tsContent, "utf-8");
console.log(`      ✓ Weights saved to: src/services/neural-weights.ts`);
console.log("=".repeat(76));
