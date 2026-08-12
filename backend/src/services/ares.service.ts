import { prisma } from "../db/prisma";

export interface BehavioralSignalInput {
  dwellTimeMs?: number | null;
  flightTimeMs?: number | null;
  typingSpeedCpm?: number | null;
  correctionRate?: number | null;
  context?: {
    userAgent?: string;
    ipAddress?: string;
    deviceType?: string;
    locationCoarse?: string;
    timeOfDay?: string; // "morning", "afternoon", "evening", "night"
  };
}

export interface ScorerResult {
  riskScore: number;       // 0..1
  trustScore: number;      // 0..1
  confidence: number;      // 0..1
  signalsJson: string;     // snapshot of signals
  decision: string;        // NORMAL | STEP_UP | RESTRICTED | SHADOW
}

// ── Target Normal Baseline Profile for Demo User ─────────────────────
// Seeded normal behavior represents typing rhythms of the legitimate user
export const constLegitBaseline = {
  dwellTimeMs: { mean: 110, std: 20 },
  flightTimeMs: { mean: 175, std: 35 },
  typingSpeedCpm: { mean: 250, std: 45 },
  correctionRate: { mean: 0.05, std: 0.02 },
  context: {
    deviceType: "desktop",
    locationCoarse: "US-EAST",
  }
};

// ── Risk Threshold Policies ──────────────────────────────────────────
// Determines session state transitions based on risk scores
const SHADOW_THRESHOLD = 0.85;
const RESTRICTED_THRESHOLD = 0.65;
const STEP_UP_THRESHOLD = 0.40;

function decideStateFromRisk(riskScore: number): string {
  if (riskScore >= SHADOW_THRESHOLD) return "SHADOW";
  if (riskScore >= RESTRICTED_THRESHOLD) return "RESTRICTED";
  if (riskScore >= STEP_UP_THRESHOLD) return "STEP_UP";
  return "NORMAL";
}

// ── 1. Baseline Rule Model ───────────────────────────────────────────
// Deterministic rule-based scorer
export function evaluateBaselineRule(signal: BehavioralSignalInput): ScorerResult {
  let penaltyPoints = 0;
  const anomalies: string[] = [];

  const { dwellTimeMs, flightTimeMs, typingSpeedCpm, correctionRate, context } = signal;

  // Rule A: Excessive corrections (indicating high typing distress/jitters)
  if (correctionRate !== undefined && correctionRate !== null) {
    if (correctionRate > 0.35) {
      penaltyPoints += 0.4;
      anomalies.push("excessive_corrections");
    } else if (correctionRate > 0.20) {
      penaltyPoints += 0.2;
      anomalies.push("moderate_corrections");
    }
  }

  // Rule B: Typing speed slowdown or extreme speed (bot check)
  if (typingSpeedCpm !== undefined && typingSpeedCpm !== null) {
    if (typingSpeedCpm < 90) {
      penaltyPoints += 0.3;
      anomalies.push("critical_typing_slowdown");
    } else if (typingSpeedCpm > 650) {
      penaltyPoints += 0.5;
      anomalies.push("suspected_automated_input");
    }
  }

  // Rule C: Key press transition flight time delays
  if (flightTimeMs !== undefined && flightTimeMs !== null) {
    if (flightTimeMs > 500) {
      penaltyPoints += 0.3;
      anomalies.push("excessive_flight_delay");
    }
  }

  // Rule D: Contextual shifts
  if (context) {
    if (context.deviceType && context.deviceType !== constLegitBaseline.context.deviceType) {
      penaltyPoints += 0.35;
      anomalies.push("device_mismatch");
    }
    if (context.locationCoarse && context.locationCoarse !== constLegitBaseline.context.locationCoarse) {
      penaltyPoints += 0.4;
      anomalies.push("location_mismatch");
    }
  }

  const riskScore = Math.min(penaltyPoints, 1.0);
  const trustScore = 1.0 - riskScore;
  const confidence = 0.70; // Hardcoded confidence index for static rules

  return {
    riskScore,
    trustScore,
    confidence,
    signalsJson: JSON.stringify({ signal, anomalies }),
    decision: decideStateFromRisk(riskScore),
  };
}

// ── 2. ML Anomaly Classifier Model ──────────────────────────────────
// Distance-based classifier (Z-score Mahalanobis metric approximation)
// Maps multidimensional deviations into a logistic probability curve.
export function evaluateMLModel(signal: BehavioralSignalInput): ScorerResult {
  const { dwellTimeMs, flightTimeMs, typingSpeedCpm, correctionRate, context } = signal;

  let totalSquaredDistance = 0;
  let featuresCount = 0;
  const featureDeviations: Record<string, number> = {};

  // Compute Z-Scores for present features
  if (dwellTimeMs !== undefined && dwellTimeMs !== null) {
    const z = (dwellTimeMs - constLegitBaseline.dwellTimeMs.mean) / constLegitBaseline.dwellTimeMs.std;
    totalSquaredDistance += z * z;
    featuresCount++;
    featureDeviations.dwellTimeMs = z;
  }

  if (flightTimeMs !== undefined && flightTimeMs !== null) {
    const z = (flightTimeMs - constLegitBaseline.flightTimeMs.mean) / constLegitBaseline.flightTimeMs.std;
    totalSquaredDistance += z * z;
    featuresCount++;
    featureDeviations.flightTimeMs = z;
  }

  if (typingSpeedCpm !== undefined && typingSpeedCpm !== null) {
    const z = (typingSpeedCpm - constLegitBaseline.typingSpeedCpm.mean) / constLegitBaseline.typingSpeedCpm.std;
    totalSquaredDistance += z * z;
    featuresCount++;
    featureDeviations.typingSpeedCpm = z;
  }

  if (correctionRate !== undefined && correctionRate !== null) {
    const z = (correctionRate - constLegitBaseline.correctionRate.mean) / constLegitBaseline.correctionRate.std;
    totalSquaredDistance += z * z;
    featuresCount++;
    featureDeviations.correctionRate = z;
  }

  // Calculate Euclidean-Z distance
  const distance = featuresCount > 0 ? Math.sqrt(totalSquaredDistance / featuresCount) : 0;

  // Add context penalty multipliers directly to distance
  let contextDistance = 0;
  if (context) {
    if (context.deviceType && context.deviceType !== constLegitBaseline.context.deviceType) {
      contextDistance += 2.0; // Significant distance shift
    }
    if (context.locationCoarse && context.locationCoarse !== constLegitBaseline.context.locationCoarse) {
      contextDistance += 2.5; // Significant location shift
    }
  }

  const finalMetric = distance + contextDistance;

  // Sigmoid mapping: maps final distance metric into [0, 1] probability curve
  // Under normal variations (metric < 1.5), risk stays low (< 0.15)
  // Under clear deviations (metric > 3.0), risk rises quickly (> 0.70)
  const midpoint = 2.2;
  const steepness = 1.8;
  const riskScore = 1 / (1 + Math.exp(-steepness * (finalMetric - midpoint)));

  const trustScore = 1.0 - riskScore;

  // Confidence is proportional to number of behavioral features supplied
  const confidence = Math.min(0.5 + (featuresCount * 0.1), 0.95);

  return {
    riskScore: Math.round(riskScore * 100) / 100,
    trustScore: Math.round(trustScore * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    signalsJson: JSON.stringify({ signal, distance: finalMetric, deviations: featureDeviations }),
    decision: decideStateFromRisk(riskScore),
  };
}

// ── Main ARES Pipeline ────────────────────────────────────────────────
// Consumes signals, evaluates both models, saves records, updates session
export async function runAresPipeline(
  sessionId: string,
  userId: string,
  signal: BehavioralSignalInput
): Promise<{ baselineResult: ScorerResult; mlResult: ScorerResult }> {
  // 1. Evaluate models
  const baselineResult = evaluateBaselineRule(signal);
  const mlResult = evaluateMLModel(signal);

  // 2. Save Behavioral Event
  await prisma.behavioralEvent.create({
    data: {
      sessionId,
      userId,
      dwellTimeMs: signal.dwellTimeMs ?? null,
      flightTimeMs: signal.flightTimeMs ?? null,
      typingSpeedCpm: signal.typingSpeedCpm ?? null,
      correctionRate: signal.correctionRate ?? null,
      contextJson: signal.context ? JSON.stringify(signal.context) : null,
    },
  });

  // 3. Save Risk Events for both models
  await prisma.riskEvent.create({
    data: {
      sessionId,
      modelUsed: "BASELINE_RULE",
      riskScore: baselineResult.riskScore,
      trustScore: baselineResult.trustScore,
      confidence: baselineResult.confidence,
      signalsJson: baselineResult.signalsJson,
      decision: baselineResult.decision,
    },
  });

  const mlRiskEvent = await prisma.riskEvent.create({
    data: {
      sessionId,
      modelUsed: "ML_MODEL",
      riskScore: mlResult.riskScore,
      trustScore: mlResult.trustScore,
      confidence: mlResult.confidence,
      signalsJson: mlResult.signalsJson,
      decision: mlResult.decision,
    },
  });

  // 4. Update the Session state in the database
  // Note: For Block D we use the ML Model as the active decision maker.
  // In Block E, the Policy Engine will govern policy decisions explicitly.
  const oldSession = await prisma.session.findUnique({ where: { id: sessionId } });
  const fromState = oldSession?.state ?? "NORMAL";
  const toState = mlResult.decision;

  if (fromState !== toState) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { state: toState },
    });

    // Log policy transition
    await prisma.policyDecision.create({
      data: {
        sessionId,
        riskEventId: mlRiskEvent.id,
        fromState,
        toState,
        reason: `ARES ML_MODEL evaluated riskScore = ${mlResult.riskScore} yielding ${toState}`,
      },
    });
  }

  return { baselineResult, mlResult };
}
