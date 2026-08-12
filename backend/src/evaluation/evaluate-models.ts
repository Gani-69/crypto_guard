/* ── ARES Model Evaluation Engine ──────────────────────────────────────
   Runs both ARES models (Baseline Rule + ML Anomaly Classifier) against
   a labeled synthetic dataset and computes standard binary classification
   metrics for the research comparison.

   Binary framing:
     NORMAL decision   → predicted NORMAL
     Any other decision → predicted ANOMALOUS
     (STEP_UP, RESTRICTED, SHADOW all count as "anomalous detection")

   Metrics computed per model:
     - True Positives  (TP): anomalous sample correctly flagged
     - True Negatives  (TN): normal sample correctly passed
     - False Positives (FP): normal sample incorrectly flagged
     - False Negatives (FN): anomalous sample missed
     - Accuracy, Precision, Recall, F1-Score
     - False Positive Rate (FPR), False Negative Rate (FNR)
   ──────────────────────────────────────────────────────────────────── */

import {
  evaluateBaselineRule,
  evaluateMLModel,
  type ScorerResult,
} from "../services/ares.service";
import type { LabeledSample, GroundTruthLabel } from "./synthetic-dataset";

// ── Types ────────────────────────────────────────────────────────────

export interface ConfusionMatrix {
  tp: number; // True Positives (anomalous correctly detected)
  tn: number; // True Negatives (normal correctly passed)
  fp: number; // False Positives (normal incorrectly flagged)
  fn: number; // False Negatives (anomalous missed)
}

export interface ModelMetrics {
  modelName: string;
  totalSamples: number;
  confusion: ConfusionMatrix;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;  // FPR = FP / (FP + TN)
  falseNegativeRate: number;  // FNR = FN / (FN + TP)
}

export interface CategoryBreakdown {
  category: string;
  totalSamples: number;
  baselineDecisions: Record<string, number>;
  mlDecisions: Record<string, number>;
}

export interface EvaluationResult {
  timestamp: string;
  datasetSize: number;
  samplesPerCategory: number;
  categories: string[];
  baseline: ModelMetrics;
  ml: ModelMetrics;
  categoryBreakdowns: CategoryBreakdown[];
  samplePredictions: SamplePrediction[];
}

export interface SamplePrediction {
  id: number;
  category: string;
  groundTruth: GroundTruthLabel;
  baselineDecision: string;
  baselineRiskScore: number;
  baselinePredictedLabel: GroundTruthLabel;
  mlDecision: string;
  mlRiskScore: number;
  mlPredictedLabel: GroundTruthLabel;
}

// ── Evaluation engine ────────────────────────────────────────────────

function decisionToLabel(decision: string): GroundTruthLabel {
  return decision === "NORMAL" ? "NORMAL" : "ANOMALOUS";
}

function computeMetrics(
  modelName: string,
  predictions: { groundTruth: GroundTruthLabel; predicted: GroundTruthLabel }[]
): ModelMetrics {
  let tp = 0, tn = 0, fp = 0, fn = 0;

  for (const { groundTruth, predicted } of predictions) {
    if (groundTruth === "ANOMALOUS" && predicted === "ANOMALOUS") tp++;
    else if (groundTruth === "NORMAL" && predicted === "NORMAL") tn++;
    else if (groundTruth === "NORMAL" && predicted === "ANOMALOUS") fp++;
    else if (groundTruth === "ANOMALOUS" && predicted === "NORMAL") fn++;
  }

  const accuracy = (tp + tn) / (tp + tn + fp + fn) || 0;
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1Score = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;
  const falsePositiveRate = (fp + tn) > 0 ? fp / (fp + tn) : 0;
  const falseNegativeRate = (fn + tp) > 0 ? fn / (fn + tp) : 0;

  return {
    modelName,
    totalSamples: predictions.length,
    confusion: { tp, tn, fp, fn },
    accuracy: round(accuracy),
    precision: round(precision),
    recall: round(recall),
    f1Score: round(f1Score),
    falsePositiveRate: round(falsePositiveRate),
    falseNegativeRate: round(falseNegativeRate),
  };
}

function round(v: number, decimals = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

export function evaluateModels(samples: LabeledSample[]): EvaluationResult {
  const samplePredictions: SamplePrediction[] = [];

  const baselinePreds: { groundTruth: GroundTruthLabel; predicted: GroundTruthLabel }[] = [];
  const mlPreds: { groundTruth: GroundTruthLabel; predicted: GroundTruthLabel }[] = [];

  // Per-category tracking
  const categoryMap = new Map<string, {
    total: number;
    baselineDecisions: Record<string, number>;
    mlDecisions: Record<string, number>;
  }>();

  for (const sample of samples) {
    const baselineResult: ScorerResult = evaluateBaselineRule(sample.signal);
    const mlResult: ScorerResult = evaluateMLModel(sample.signal);

    const blLabel = decisionToLabel(baselineResult.decision);
    const mlLabel = decisionToLabel(mlResult.decision);

    baselinePreds.push({ groundTruth: sample.label, predicted: blLabel });
    mlPreds.push({ groundTruth: sample.label, predicted: mlLabel });

    samplePredictions.push({
      id: sample.id,
      category: sample.category,
      groundTruth: sample.label,
      baselineDecision: baselineResult.decision,
      baselineRiskScore: round(baselineResult.riskScore),
      baselinePredictedLabel: blLabel,
      mlDecision: mlResult.decision,
      mlRiskScore: round(mlResult.riskScore),
      mlPredictedLabel: mlLabel,
    });

    // Category breakdown
    if (!categoryMap.has(sample.category)) {
      categoryMap.set(sample.category, {
        total: 0,
        baselineDecisions: {},
        mlDecisions: {},
      });
    }
    const cat = categoryMap.get(sample.category)!;
    cat.total++;
    cat.baselineDecisions[baselineResult.decision] =
      (cat.baselineDecisions[baselineResult.decision] || 0) + 1;
    cat.mlDecisions[mlResult.decision] =
      (cat.mlDecisions[mlResult.decision] || 0) + 1;
  }

  const baselineMetrics = computeMetrics("Baseline Rule Model", baselinePreds);
  const mlMetrics = computeMetrics("ML Anomaly Classifier", mlPreds);

  const categoryBreakdowns: CategoryBreakdown[] = [];
  for (const [category, data] of categoryMap.entries()) {
    categoryBreakdowns.push({
      category,
      totalSamples: data.total,
      baselineDecisions: data.baselineDecisions,
      mlDecisions: data.mlDecisions,
    });
  }

  // Sort categories in logical order
  const catOrder = ["LEGITIMATE", "MILD_DRIFT", "COERCED", "CONTEXT_MISMATCH", "BOT"];
  categoryBreakdowns.sort(
    (a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category)
  );

  return {
    timestamp: new Date().toISOString(),
    datasetSize: samples.length,
    samplesPerCategory: samples.length / categoryBreakdowns.length,
    categories: categoryBreakdowns.map((c) => c.category),
    baseline: baselineMetrics,
    ml: mlMetrics,
    categoryBreakdowns,
    samplePredictions,
  };
}
