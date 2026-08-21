interface Props {
  prices: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

/** Pure SVG sparkline — no dependency, tiny footprint */
export default function Sparkline({ prices, width = 80, height = 32, positive }: Props) {
  if (!prices || prices.length < 2) {
    return <div style={{ width, height }} />;
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  // Map price to SVG Y coordinate (invert: high price = low Y)
  const toY = (p: number) => height - ((p - min) / range) * (height - 4) - 2;
  const toX = (i: number) => (i / (prices.length - 1)) * width;

  const points = prices
    .map((p, i) => `${toX(i).toFixed(1)},${toY(p).toFixed(1)}`)
    .join(' ');

  // Closed area path
  const areaPath = [
    `M ${toX(0).toFixed(1)},${height}`,
    ...prices.map((p, i) => `L ${toX(i).toFixed(1)},${toY(p).toFixed(1)}`),
    `L ${toX(prices.length - 1).toFixed(1)},${height}`,
    'Z',
  ].join(' ');

  const isPositive = positive ?? prices[prices.length - 1] >= prices[0];
  const color = isPositive ? 'var(--green-400)' : 'var(--red-400)';
  const fillColor = isPositive ? 'rgba(3, 197, 139, 0.12)' : 'rgba(255, 77, 77, 0.12)';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Area fill */}
      <path d={areaPath} fill={fillColor} />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
