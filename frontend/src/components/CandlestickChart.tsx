import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Bar, Cell } from 'recharts';
import { formatUsd } from '../types';
import './CandlestickChart.css';

interface OHLCPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  data: OHLCPoint[];
}

/** Custom candlestick shape: body + wick */
function CandleShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;

  const { open, high, low, close } = payload;
  const bullish = close >= open;
  const fill = bullish ? 'var(--green-400)' : 'var(--red-400)';
  const stroke = bullish ? 'var(--green-500)' : 'var(--red-500)';

  const centerX = x + width / 2;
  const range = high - low;
  if (range === 0) return null;

  // Wick: full high→low line
  const yHigh = y;
  const yLow = y + height;
  const bodyTop = y + ((high - Math.max(open, close)) / range) * height;
  const bodyBottom = y + ((high - Math.min(open, close)) / range) * height;
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

  return (
    <g>
      {/* Wick */}
      <line
        x1={centerX}
        y1={yHigh}
        x2={centerX}
        y2={yLow}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Body */}
      <rect
        x={x + width * 0.15}
        y={bodyTop}
        width={width * 0.7}
        height={bodyHeight}
        fill={bullish ? fill : fill}
        stroke={stroke}
        strokeWidth={0.5}
        rx={1}
      />
    </g>
  );
}

/** Custom tooltip for OHLC data */
function OHLCTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]?.payload) return null;
  const d = payload[0].payload;

  return (
    <div className="candlestick-tooltip">
      <div className="candlestick-tooltip__time">{d.time}</div>
      <div className="candlestick-tooltip__row">
        <span>Open</span><span>{formatUsd(d.open)}</span>
      </div>
      <div className="candlestick-tooltip__row">
        <span>High</span><span className="text-green">{formatUsd(d.high)}</span>
      </div>
      <div className="candlestick-tooltip__row">
        <span>Low</span><span className="text-red">{formatUsd(d.low)}</span>
      </div>
      <div className="candlestick-tooltip__row">
        <span>Close</span><span style={{ color: d.close >= d.open ? 'var(--green-400)' : 'var(--red-400)' }}>{formatUsd(d.close)}</span>
      </div>
    </div>
  );
}

export default function CandlestickChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="text-muted" style={{ padding: 40, textAlign: 'center' }}>No OHLC data available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
        <XAxis
          dataKey="time"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--border-default)' }}
          tickLine={false}
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatUsd(v)}
          width={90}
        />
        <Tooltip content={<OHLCTooltip />} />
        <Bar
          dataKey="high"
          shape={<CandleShape />}
          isAnimationActive={false}
        >
          {data.map((_entry, index) => (
            <Cell key={index} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Aggregate raw price points into OHLC buckets */
export function aggregateToOHLC(
  points: Array<{ timestamp: number; price: number }>,
  bucketCount: number = 30
): OHLCPoint[] {
  if (points.length === 0) return [];

  const bucketSize = Math.max(1, Math.floor(points.length / bucketCount));
  const ohlc: OHLCPoint[] = [];

  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize);
    if (bucket.length === 0) continue;

    const prices = bucket.map((p) => p.price);
    const d = new Date(bucket[0].timestamp);
    const timeLabel = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

    ohlc.push({
      time: timeLabel,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
    });
  }

  return ohlc;
}
