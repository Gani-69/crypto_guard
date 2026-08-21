import { useEffect, useState } from 'react';
import './FearGreedGauge.css';

interface Props {
  avgChange24h: number;
  gainers: number;
  losers: number;
}

const ZONES = [
  { min: 0,  max: 20,  label: 'Extreme Fear', color: '#ef4444' },
  { min: 20, max: 40,  label: 'Fear',         color: '#f97316' },
  { min: 40, max: 60,  label: 'Neutral',      color: '#eab308' },
  { min: 60, max: 80,  label: 'Greed',        color: '#84cc16' },
  { min: 80, max: 100, label: 'Extreme Greed',color: '#22c55e' },
];

function getZone(score: number) {
  return ZONES.find((z) => score >= z.min && score <= z.max) ?? ZONES[2];
}

/** Compute 0-100 score from market signals */
function computeScore(avgChange24h: number, gainers: number, losers: number): number {
  const total = gainers + losers || 1;
  const gainRatio = gainers / total; // 0-1

  // avgChange24h contributes ±25 points around 50
  const changeFactor = Math.max(-1, Math.min(1, avgChange24h / 5));
  const changeScore = 50 + changeFactor * 25;

  // gainer ratio contributes 0-50 points
  const gainScore = gainRatio * 50;

  const raw = changeScore * 0.5 + gainScore;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** SVG semicircle gauge with animated needle */
export default function FearGreedGauge({ avgChange24h, gainers, losers }: Props) {
  const score = computeScore(avgChange24h, gainers, losers);
  const zone = getZone(score);

  // Animate needle from 0 to score on mount
  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDisplayScore(score), 80);
    return () => clearTimeout(timer);
  }, [score]);

  // Needle angle: 0 score = -90deg (left), 100 = 90deg (right)
  const needleAngle = -90 + (displayScore / 100) * 180;

  // SVG constants
  const cx = 90, cy = 90, r = 72;

  return (
    <div className="fear-greed">
      <div className="fear-greed__title">Fear &amp; Greed Index</div>
      <div className="fear-greed__gauge-wrap">
        <svg viewBox="0 0 180 100" className="fear-greed__svg">
          {/* Background arc bands */}
          {ZONES.map((zone, i) => {
            const startDeg = -180 + i * 36;
            const endDeg = startDeg + 36;
            const startRad = (startDeg * Math.PI) / 180;
            const endRad = (endDeg * Math.PI) / 180;
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);
            return (
              <path
                key={i}
                d={`M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`}
                fill={zone.color}
                opacity={0.18}
              />
            );
          })}

          {/* Arc outline */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="var(--border-default)"
            strokeWidth={1}
          />

          {/* Needle */}
          <g
            transform={`rotate(${needleAngle}, ${cx}, ${cy})`}
            style={{ transition: 'transform 1s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            <line
              x1={cx}
              y1={cy}
              x2={cx + r - 8}
              y2={cy}
              stroke={zone.color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={5} fill={zone.color} />
          </g>

          {/* Score text */}
          <text x={cx} y={cy - 12} textAnchor="middle" className="fear-greed__score-text">
            {score}
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" className="fear-greed__zone-text">
            {zone.label}
          </text>
        </svg>
      </div>

      {/* Zone labels */}
      <div className="fear-greed__labels">
        <span style={{ color: ZONES[0].color }}>Fear</span>
        <span style={{ color: ZONES[2].color }}>Neutral</span>
        <span style={{ color: ZONES[4].color }}>Greed</span>
      </div>
    </div>
  );
}
