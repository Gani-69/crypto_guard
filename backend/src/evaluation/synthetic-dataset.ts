/* ── Synthetic Behavioral Dataset Generator ───────────────────────────
   Generates labeled test vectors for evaluating ARES models.
   
   5 behavioral categories, each with a ground-truth label:
     LEGITIMATE       → NORMAL   (matching baseline profile)
     MILD_DRIFT       → NORMAL   (slight natural variation, still same user)
     COERCED          → ANOMALOUS (distressed/nervous typing under duress)
     CONTEXT_MISMATCH → ANOMALOUS (correct typing rhythm, wrong device/location)
     BOT              → ANOMALOUS (automated/scripted input)
   
   Each sample has controlled randomization around a category centroid
   to produce realistic variance within each class.
   ──────────────────────────────────────────────────────────────────── */

import type { BehavioralSignalInput } from "../services/ares.service";

export type GroundTruthLabel = "NORMAL" | "ANOMALOUS";

export interface LabeledSample {
  id: number;
  category: string;
  label: GroundTruthLabel;
  signal: BehavioralSignalInput;
}

let seed = 42;

export function setSeed(newSeed: number): void {
  seed = newSeed;
}

function random(): number {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── Gaussian noise helper ────────────────────────────────────────────
function gaussianNoise(mean: number, std: number): number {
  // Box-Muller transform
  const u1 = random();
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Category definitions ─────────────────────────────────────────────

function generateLegitimate(): BehavioralSignalInput {
  return {
    dwellTimeMs: clamp(gaussianNoise(110, 15), 60, 180),
    flightTimeMs: clamp(gaussianNoise(175, 25), 80, 350),
    typingSpeedCpm: clamp(gaussianNoise(250, 35), 120, 400),
    correctionRate: clamp(gaussianNoise(0.05, 0.02), 0, 0.15),
    context: { deviceType: "desktop", locationCoarse: "US-EAST" },
  };
}

function generateMildDrift(): BehavioralSignalInput {
  // Same user, slightly tired/distracted — still within normal bounds
  return {
    dwellTimeMs: clamp(gaussianNoise(130, 20), 70, 220),
    flightTimeMs: clamp(gaussianNoise(210, 35), 100, 400),
    typingSpeedCpm: clamp(gaussianNoise(200, 40), 100, 350),
    correctionRate: clamp(gaussianNoise(0.08, 0.03), 0, 0.18),
    context: { deviceType: "desktop", locationCoarse: "US-EAST" },
  };
}

function generateCoerced(): BehavioralSignalInput {
  // Nervous, distressed — erratic rhythm, many corrections, slow
  return {
    dwellTimeMs: clamp(gaussianNoise(200, 35), 100, 350),
    flightTimeMs: clamp(gaussianNoise(480, 70), 250, 800),
    typingSpeedCpm: clamp(gaussianNoise(70, 20), 20, 130),
    correctionRate: clamp(gaussianNoise(0.38, 0.08), 0.15, 0.65),
    context: { deviceType: "desktop", locationCoarse: "US-EAST" },
  };
}

function generateContextMismatch(): BehavioralSignalInput {
  // Typing rhythm is normal, but device/location don't match baseline
  const locations = ["ASIA-PAC", "EU-WEST", "SOUTH-AM", "AFRICA"];
  const devices = ["mobile", "tablet"];
  return {
    dwellTimeMs: clamp(gaussianNoise(115, 18), 60, 200),
    flightTimeMs: clamp(gaussianNoise(180, 30), 90, 360),
    typingSpeedCpm: clamp(gaussianNoise(240, 35), 120, 380),
    correctionRate: clamp(gaussianNoise(0.06, 0.025), 0, 0.15),
    context: {
      deviceType: devices[Math.floor(random() * devices.length)],
      locationCoarse: locations[Math.floor(random() * locations.length)],
    },
  };
}

function generateBot(): BehavioralSignalInput {
  // Automated input — extremely fast, zero corrections, unnaturally regular
  return {
    dwellTimeMs: clamp(gaussianNoise(18, 5), 5, 40),
    flightTimeMs: clamp(gaussianNoise(12, 4), 3, 30),
    typingSpeedCpm: clamp(gaussianNoise(850, 80), 600, 1200),
    correctionRate: clamp(gaussianNoise(0.005, 0.005), 0, 0.02),
    context: { deviceType: "desktop", locationCoarse: "US-EAST" },
  };
}

// ── Dataset generation ───────────────────────────────────────────────

export interface DatasetConfig {
  samplesPerCategory: number;
  seed?: number;
}

const DEFAULT_CONFIG: DatasetConfig = { samplesPerCategory: 200, seed: 42 };

export function generateSyntheticDataset(
  config: DatasetConfig = DEFAULT_CONFIG
): LabeledSample[] {
  const n = config.samplesPerCategory;
  if (config.seed !== undefined) {
    seed = config.seed;
  } else {
    seed = 42;
  }
  const samples: LabeledSample[] = [];
  let id = 0;

  const categories: {
    name: string;
    label: GroundTruthLabel;
    generator: () => BehavioralSignalInput;
  }[] = [
    { name: "LEGITIMATE", label: "NORMAL", generator: generateLegitimate },
    { name: "MILD_DRIFT", label: "NORMAL", generator: generateMildDrift },
    { name: "COERCED", label: "ANOMALOUS", generator: generateCoerced },
    { name: "CONTEXT_MISMATCH", label: "ANOMALOUS", generator: generateContextMismatch },
    { name: "BOT", label: "ANOMALOUS", generator: generateBot },
  ];

  for (const cat of categories) {
    for (let i = 0; i < n; i++) {
      samples.push({
        id: id++,
        category: cat.name,
        label: cat.label,
        signal: cat.generator(),
      });
    }
  }

  // Shuffle for unbiased evaluation order
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }

  return samples;
}
