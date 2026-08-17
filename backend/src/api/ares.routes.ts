import { Router, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";
import { runAresPipeline } from "../services/ares.service";
import { prisma } from "../db/prisma";

const router = Router();

// POST /api/ares/signal — submit behavioral sample to run ARES evaluations
router.post("/signal", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { dwellTimeMs, flightTimeMs, typingSpeedCpm, correctionRate, context } = req.body;
    const session = req.session!;
    const user = req.user!;

    // Input validation helper
    const isValidNumber = (val: any) => {
      if (val === undefined || val === null) return true;
      const num = Number(val);
      return !isNaN(num) && isFinite(num) && typeof val !== "boolean";
    };

    if (
      !isValidNumber(dwellTimeMs) ||
      !isValidNumber(flightTimeMs) ||
      !isValidNumber(typingSpeedCpm) ||
      !isValidNumber(correctionRate)
    ) {
      res.status(400).json({
        error: "invalid_input",
        message: "Signal values (dwellTimeMs, flightTimeMs, typingSpeedCpm, correctionRate) must be valid numbers.",
      });
      return;
    }

    // Compile contextual signals
    const userAgent = req.headers["user-agent"] || undefined;
    const ipAddress = (req.ip || req.headers["x-forwarded-for"] as string) || undefined;

    const fullSignal = {
      dwellTimeMs,
      flightTimeMs,
      typingSpeedCpm,
      correctionRate,
      context: {
        userAgent,
        ipAddress,
        deviceType: userAgent?.toLowerCase().includes("mobile") ? "mobile" : "desktop",
        locationCoarse: context?.locationCoarse || "US-EAST", // Standard mock locations
        timeOfDay: getCoarseTimeOfDay(),
      },
    };

    const results = await runAresPipeline(session.id, user.id, fullSignal);

    res.json({
      status: "evaluated",
      sessionState: results.mlResult.decision, // Active model decision
      models: {
        baseline: results.baselineResult,
        ml: results.mlResult,
        neural: results.neuralResult,
      },
    });
  } catch (err) {
    console.error("[ares] POST /signal error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/ares/risk — fetch history of risk estimations and policy logs for current session
router.get("/risk", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = req.session!;

    // Fetch latest risk estimations for ML and Baseline
    const latestEvents = await prisma.riskEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const mlEvents = latestEvents.filter(e => e.modelUsed === "ML_MODEL");
    const baselineEvents = latestEvents.filter(e => e.modelUsed === "BASELINE_RULE");

    // Fetch policy transition logs
    const policyLogs = await prisma.policyDecision.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.json({
      sessionId: session.id,
      currentState: session.state,
      latestScores: {
        ml: mlEvents[0] || null,
        baseline: baselineEvents[0] || null,
      },
      history: {
        ml: mlEvents.reverse().map(e => ({
          timestamp: e.createdAt,
          riskScore: e.riskScore,
          trustScore: e.trustScore,
          confidence: e.confidence,
          decision: e.decision,
        })),
        baseline: baselineEvents.reverse().map(e => ({
          timestamp: e.createdAt,
          riskScore: e.riskScore,
          trustScore: e.trustScore,
          confidence: e.confidence,
          decision: e.decision,
        })),
      },
      policyLogs: policyLogs.map(l => ({
        id: l.id,
        fromState: l.fromState,
        toState: l.toState,
        reason: l.reason,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    console.error("[ares] GET /risk error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

function getCoarseTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export default router;
