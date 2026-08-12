import { useParams, Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Star,
  BarChart3,
  Clock,
  DollarSign,
  Activity,
} from 'lucide-react';
import { useCoin } from '../hooks/useMarketData';
import { CRYPTO_ICONS, ICON_COLORS } from '../components/PriceCard';
import { formatUsd, formatPct } from '../types';
import { useState } from 'react';
import * as api from '../api/client';
import './CoinDetail.css';

export default function CoinDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const { coin, loading, error } = useCoin(symbol ?? '');
  const [watchlisted, setWatchlisted] = useState(false);

  if (loading) {
    return (
      <div className="coin-detail fade-in">
        <div className="skeleton" style={{ height: 40, width: 200 }} />
        <div className="skeleton" style={{ height: 400, borderRadius: 16, marginTop: 20 }} />
      </div>
    );
  }

  if (error || !coin) {
    return (
      <div className="coin-detail__error card">
        <h2>Coin not found</h2>
        <p className="text-muted">Could not load data for "{symbol}"</p>
        <Link to="/markets" className="btn btn-primary">Back to Markets</Link>
      </div>
    );
  }

  const isUp = (coin.change24hPct ?? 0) >= 0;
  const chartColor = isUp ? '#22c55e' : '#ef4444';

  // Format chart data
  const chartData = (coin.priceHistory7d ?? []).map((p) => ({
    time: new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    timeShort: new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    price: p.price,
  }));

  // Downsample to ~50 points for readability
  const step = Math.max(1, Math.floor(chartData.length / 50));
  const sampledData = chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1);

  const handleWatchlist = async () => {
    try {
      if (watchlisted) {
        await api.removeFromWatchlist(coin.id);
      } else {
        await api.addToWatchlist(coin.id);
      }
      setWatchlisted(!watchlisted);
    } catch (e) { /* swallow for now */ }
  };

  const stats = [
    { label: 'Market Cap', value: formatUsd(coin.marketCapUsd ?? 0, true), icon: DollarSign },
    { label: '24h Volume', value: formatUsd(coin.volume24hUsd ?? 0, true), icon: BarChart3 },
    { label: '24h Change', value: formatPct(coin.change24hPct), icon: Activity, color: isUp ? 'var(--green-400)' : 'var(--red-400)' },
    { label: 'Rank', value: `#${coin.rank ?? '—'}`, icon: TrendingUp },
  ];

  return (
    <div className="coin-detail fade-in">
      {/* ── Back nav ── */}
      <Link to="/markets" className="coin-detail__back">
        <ArrowLeft size={16} /> Back to Markets
      </Link>

      {/* ── Header ── */}
      <div className="coin-detail__header">
        <div className="coin-detail__title-row">
          <div
            className="coin-detail__icon"
            style={{
              background: `${ICON_COLORS[coin.symbol] ?? 'var(--cyan-500)'}22`,
              color: ICON_COLORS[coin.symbol] ?? 'var(--cyan-400)',
            }}
          >
            {CRYPTO_ICONS[coin.symbol] ?? coin.symbol[0]}
          </div>
          <div>
            <h1>{coin.name} <span className="coin-detail__sym">{coin.symbol}</span></h1>
            {coin.isTrending && <span className="badge badge-amber"><span>🔥</span> Trending</span>}
          </div>
          <button
            className={`btn ${watchlisted ? 'btn-primary' : 'btn-secondary'} coin-detail__watchlist-btn`}
            onClick={handleWatchlist}
          >
            <Star size={16} fill={watchlisted ? 'currentColor' : 'none'} />
            {watchlisted ? 'Watchlisted' : 'Add to Watchlist'}
          </button>
        </div>

        <div className="coin-detail__price-row">
          <span className="coin-detail__price">{formatUsd(coin.priceUsd)}</span>
          <span className={`coin-detail__change ${isUp ? 'text-green' : 'text-red'}`}>
            {isUp ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            {formatPct(coin.change24hPct)}
          </span>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="coin-detail__chart card">
        <div className="coin-detail__chart-header">
          <h3>7-Day Price Chart</h3>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
            <Clock size={12} /> Synthetic data
          </span>
        </div>
        <div className="coin-detail__chart-area">
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={sampledData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
              <XAxis
                dataKey="time"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => formatUsd(v, true)}
                width={70}
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
                labelStyle={{ color: 'var(--text-muted)' }}
                formatter={(value: any) => [formatUsd(Number(value) || 0), 'Price']}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#chartGradient)"
                dot={false}
                activeDot={{ r: 5, stroke: chartColor, strokeWidth: 2, fill: 'var(--bg-card)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="coin-detail__stats">
        {stats.map((s) => (
          <div key={s.label} className="coin-detail__stat card">
            <s.icon size={18} className="text-muted" />
            <div>
              <span className="coin-detail__stat-label">{s.label}</span>
              <span className="coin-detail__stat-value" style={s.color ? { color: s.color } : {}}>
                {s.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Trading (Block C) ── */}
      <div className="coin-detail__trade card">
        <h3>Trade {coin.symbol}</h3>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
          Execute instant market or limit orders in our simulated engine.
        </p>
        <div className="coin-detail__trade-buttons">
          <Link to={`/trading?symbol=${coin.symbol}&side=BUY`} className="btn btn-success">
            Buy {coin.symbol}
          </Link>
          <Link to={`/trading?symbol=${coin.symbol}&side=SELL`} className="btn btn-danger">
            Sell {coin.symbol}
          </Link>
        </div>
      </div>
    </div>
  );
}
