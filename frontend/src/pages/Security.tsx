import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Activity,
  History,
  Info,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { SimulationMode } from '../hooks/useKeystrokeBiometrics';
import { formatPct } from '../types';
import './Security.css';

interface RiskData {
  sessionId: string;
  currentState: string;
  latestScores: {
    ml: any | null;
    baseline: any | null;
  };
  history: {
    ml: any[];
    baseline: any[];
  };
  policyLogs: any[];
}

export default function Security() {
  const { session, refreshSessionState } = useAuth();
  const [simMode, setSimMode] = useState<SimulationMode>('NONE');
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Sync simulation mode with localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cg_sim_mode') as SimulationMode;
    if (saved) setSimMode(saved);
  }, []);

  const handleModeChange = (mode: SimulationMode) => {
    setSimMode(mode);
    localStorage.setItem('cg_sim_mode', mode);
  };

  const fetchRiskData = async () => {
    try {
      const res = await fetch('/api/ares/risk');
      if (res.ok) {
        const data = await res.json();
        setRiskData(data);
      }
    } catch (err) {
      console.error('Failed to fetch ARES risk logs:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
    // Auto refresh logs every 4 seconds to show live updates as user types
    const interval = setInterval(fetchRiskData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await refreshSessionState();
    await fetchRiskData();
  };

  // Compile history logs into chart dataset format
  const chartData = (() => {
    if (!riskData) return [];
    
    const mlHist = riskData.history.ml || [];
    const bsHist = riskData.history.baseline || [];

    // Map timestamps into readable labels
    const pointsCount = Math.max(mlHist.length, bsHist.length);
    const data = [];

    for (let i = 0; i < pointsCount; i++) {
      const mlPoint = mlHist[i];
      const bsPoint = bsHist[i];
      const time = mlPoint
        ? new Date(mlPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : bsPoint
        ? new Date(bsPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '';

      data.push({
        time,
        'ML Model': mlPoint ? mlPoint.riskScore : null,
        'Baseline Rule': bsPoint ? bsPoint.riskScore : null,
      });
    }

    return data;
  })();

  const currentState = session?.state ?? 'NORMAL';
  const mlScore = riskData?.latestScores?.ml?.riskScore ?? 0;
  const mlConfidence = riskData?.latestScores?.ml?.confidence ?? 0;
  const bsScore = riskData?.latestScores?.baseline?.riskScore ?? 0;

  // Visual highlights based on active session state
  const stateColors: Record<string, string> = {
    NORMAL: 'var(--green-400)',
    STEP_UP: 'var(--amber-400)',
    RESTRICTED: 'var(--red-400)',
    SHADOW: 'var(--purple-400)',
  };

  const activeColor = stateColors[currentState] || 'var(--cyan-400)';

  return (
    <div className="security fade-in">
      <div className="security__header">
        <div>
          <h1>ARES Security Dashboard</h1>
          <p className="text-secondary">Keystroke biometric telemetry and Policy Engine analytics</p>
        </div>
        <button
          className="btn btn-secondary security__refresh-btn"
          onClick={handleManualRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'security__spin' : ''} />
          Refresh Status
        </button>
      </div>

      {/* ── Visual Risk Gauges ── */}
      <div className="security__gauges-grid">
        {/* Session State Card */}
        <div className="security__gauge-card card flex-col items-center justify-center">
          <div className="security__gauge-icon-wrap" style={{ color: activeColor, background: `${activeColor}15` }}>
            {currentState === 'NORMAL' ? (
              <ShieldCheck size={40} />
            ) : currentState === 'SHADOW' ? (
              <ShieldAlert size={40} />
            ) : (
              <Shield size={40} />
            )}
          </div>
          <span className="security__gauge-label">Session Access State</span>
          <span className="security__gauge-value" style={{ color: activeColor }}>
            {currentState}
          </span>
          <span className="security__gauge-desc text-center">
            {currentState === 'NORMAL' && 'All trades and transfers are authenticated.'}
            {currentState === 'STEP_UP' && 'Verifying identity. Secondary challenge requested.'}
            {currentState === 'RESTRICTED' && 'High-risk detected. Selected functions gated.'}
            {currentState === 'SHADOW' && 'Rubber-hose attack suspected. Displaying isolated decoy portfolio.'}
          </span>
        </div>

        {/* ML Score Card */}
        <div className="security__gauge-card card flex-col items-center justify-center">
          <div className="security__dial-container">
            <svg viewBox="0 0 100 100" className="security__dial-svg">
              <circle cx="50" cy="50" r="40" className="security__dial-bg" />
              <circle
                cx="50"
                cy="50"
                r="40"
                className="security__dial-progress"
                style={{
                  strokeDasharray: '251.2',
                  strokeDashoffset: `${251.2 * (1 - mlScore)}`,
                  stroke: mlScore > 0.8 ? 'var(--red-400)' : mlScore > 0.4 ? 'var(--amber-400)' : 'var(--green-400)',
                }}
              />
            </svg>
            <span className="security__dial-score">{Math.round(mlScore * 100)}%</span>
          </div>
          <span className="security__gauge-label">ML Model Risk Score</span>
          <span className="security__gauge-desc">
            Model Confidence: <strong>{formatPct(mlConfidence * 100)}</strong>
          </span>
        </div>

        {/* Baseline Scorer Card */}
        <div className="security__gauge-card card flex-col items-center justify-center">
          <div className="security__dial-container">
            <svg viewBox="0 0 100 100" className="security__dial-svg">
              <circle cx="50" cy="50" r="40" className="security__dial-bg" />
              <circle
                cx="50"
                cy="50"
                r="40"
                className="security__dial-progress"
                style={{
                  strokeDasharray: '251.2',
                  strokeDashoffset: `${251.2 * (1 - bsScore)}`,
                  stroke: bsScore > 0.8 ? 'var(--red-400)' : bsScore > 0.4 ? 'var(--amber-400)' : 'var(--green-400)',
                }}
              />
            </svg>
            <span className="security__dial-score">{Math.round(bsScore * 100)}%</span>
          </div>
          <span className="security__gauge-label">Baseline Rule Scorer</span>
          <span className="security__gauge-desc">Static heuristic check policy</span>
        </div>
      </div>

      <div className="security__main-layout">
        {/* Left Side: Simulation settings & details */}
        <div className="security__controls-side flex-col gap-lg">
          {/* Simulation overrides */}
          <div className="card security__control-panel">
            <div className="security__section-title mb-md">
              <Sliders size={18} className="text-cyan" />
              <h2>Biometric Simulations</h2>
            </div>
            <p className="text-secondary mb-md" style={{ fontSize: '0.8rem' }}>
              Select a behavioral profile to simulate adversarial attack patterns. ARES only evaluates when a simulation is active.
            </p>
            <div className="security__sim-options">
              <button
                type="button"
                className={`security__sim-btn ${simMode === 'NONE' ? 'security__sim-btn--active' : ''}`}
                onClick={() => handleModeChange('NONE')}
              >
                Off (Paused)
              </button>
              <button
                type="button"
                className={`security__sim-btn ${simMode === 'LEGITIMATE' ? 'security__sim-btn--active' : ''}`}
                onClick={() => handleModeChange('LEGITIMATE')}
              >
                Legitimate Rhythm
              </button>
              <button
                type="button"
                className={`security__sim-btn ${simMode === 'COERCED_ANOMALOUS' ? 'security__sim-btn--active' : ''}`}
                onClick={() => handleModeChange('COERCED_ANOMALOUS')}
              >
                Distressed / Coerced
              </button>
              <button
                type="button"
                className={`security__sim-btn ${simMode === 'CONTEXT_MISM' ? 'security__sim-btn--active' : ''}`}
                onClick={() => handleModeChange('CONTEXT_MISM')}
              >
                Location Mismatch
              </button>
            </div>

            <div className="security__info-alert mt-md">
              <Info size={16} />
              <p style={{ fontSize: '0.72rem', lineHeight: 1.4 }}>
                <strong>How to test:</strong> Select <strong>Distressed / Coerced</strong> above, then navigate to Markets or Trading and type anything. ARES will evaluate the simulated signals and transition your session through STEP_UP → RESTRICTED → SHADOW. Select <strong>Off (Paused)</strong> to stop evaluations. Passcode for step-up recovery: <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.72rem' }}>123456</code>
              </p>
            </div>
          </div>

          {/* Policy Decision Timeline */}
          <div className="card security__logs-panel">
            <div className="security__section-title mb-md">
              <History size={18} className="text-purple-400" />
              <h2>Policy Decision Log</h2>
            </div>
            {riskData?.policyLogs.length === 0 ? (
              <div className="security__logs-empty">
                <p className="text-muted text-center" style={{ fontSize: '0.8rem' }}>No policy logs. Session is stable in normal mode.</p>
              </div>
            ) : (
              <div className="security__timeline">
                {riskData?.policyLogs.map((log) => {
                  const stateColor = stateColors[log.toState] || 'var(--cyan-400)';
                  return (
                    <div key={log.id} className="security__timeline-item">
                      <div className="security__timeline-dot" style={{ borderColor: stateColor, boxShadow: `0 0 8px ${stateColor}` }} />
                      <div className="security__timeline-content">
                        <span className="security__timeline-title">
                          Transitioned <strong>{log.fromState}</strong> &rarr; <strong style={{ color: stateColor }}>{log.toState}</strong>
                        </span>
                        <p className="security__timeline-reason">{log.reason}</p>
                        <span className="security__timeline-time">
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Charts */}
        <div className="security__chart-side card">
          <div className="security__section-title mb-lg">
            <Activity size={18} className="text-cyan" />
            <h2>Live Session Risk Trajectory</h2>
          </div>
          <div className="security__chart-container">
            {chartData.length === 0 ? (
              <div className="security__chart-empty flex-col items-center justify-center">
                <p className="text-muted text-center">No risk scoring log entries yet. Type key inputs anywhere to initialize telemetry data.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                  <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem',
                      boxShadow: 'var(--shadow-lg)',
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Line
                    type="monotone"
                    dataKey="ML Model"
                    stroke="var(--cyan-400)"
                    strokeWidth={2.5}
                    dot={{ r: 3, stroke: 'var(--cyan-400)', strokeWidth: 1 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Baseline Rule"
                    stroke="var(--purple-400)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
