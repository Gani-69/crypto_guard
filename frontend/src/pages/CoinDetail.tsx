import { useParams, Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
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
  DollarSign,
  Activity,
} from 'lucide-react';
import { useCoin } from '../hooks/useMarketData';
import { useWebSocket } from '../hooks/useWebSocket';
import { CRYPTO_ICONS, ICON_COLORS } from '../components/PriceCard';
import { formatUsd, formatPct } from '../types';
import { useState } from 'react';
import * as api from '../api/client';
import CandlestickChart, { aggregateToOHLC } from '../components/CandlestickChart';
import PriceAlerts from '../components/PriceAlerts';
import './CoinDetail.css';

export default function CoinDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const { coin, loading, error } = useCoin(symbol ?? '');
  const { livePrices } = useWebSocket();
  const [watchlisted, setWatchlisted] = useState(false);

  // Timeframe and Indicator toggles
  const [timeframe, setTimeframe] = useState<'1H' | '4H' | '1D' | '1W'>('1W');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [showEMA, setShowEMA] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);

  const displayPrice = (coin && livePrices[coin.symbol]) ?? coin?.priceUsd ?? 0;

  if (loading) {
    return (
      <div className="coin-detail fade-in" style={{ padding: '8px 0' }}>
        <div className="skeleton" style={{ height: 18, width: 130, marginBottom: 20 }} />
        <div className="flex justify-between items-center gap-md" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-sm">
            <div className="skeleton" style={{ height: 52, width: 52, borderRadius: 12 }} />
            <div className="flex-col gap-xs">
              <div className="skeleton" style={{ height: 28, width: 180 }} />
              <div className="skeleton" style={{ height: 16, width: 80 }} />
            </div>
          </div>
          <div className="skeleton" style={{ height: 38, width: 160, borderRadius: 10 }} />
        </div>
        <div className="flex items-baseline gap-sm" style={{ marginBottom: 24 }}>
          <div className="skeleton" style={{ height: 44, width: 220 }} />
          <div className="skeleton" style={{ height: 24, width: 80 }} />
        </div>
        <div className="skeleton" style={{ height: 340, borderRadius: 16, marginBottom: 24 }} />
        <div className="coin-detail__stats" style={{ marginBottom: 24 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 76, borderRadius: 12 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 150, borderRadius: 16 }} />
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
  const chartColor = isUp ? 'var(--green-400)' : 'var(--red-400)';

  // Calculate EMA indicator
  const calculateEMA = (data: any[], period: number) => {
    const k = 2 / (period + 1);
    let emaArray = [];
    if (data.length === 0) return [];
    let prevEma = data[0].price;
    emaArray.push(prevEma);
    for (let i = 1; i < data.length; i++) {
      const curEma = data[i].price * k + prevEma * (1 - k);
      emaArray.push(curEma);
      prevEma = curEma;
    }
    return emaArray;
  };

  // Calculate RSI indicator (14 period)
  const calculateRSI = (data: any[], period: number = 14) => {
    let rsiArray = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        rsiArray.push(50);
        continue;
      }
      let gains = 0;
      let losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = data[j].price - data[j - 1].price;
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const rs = gains / (losses || 1);
      rsiArray.push(100 - (100 / (1 + rs)));
    }
    return rsiArray;
  };

  // Calculate MACD (12-26-9)
  const calculateMACD = (data: any[]) => {
    const ema12 = calculateEMA(data, 12);
    const ema26 = calculateEMA(data, 26);
    let macdArray = [];
    for (let i = 0; i < data.length; i++) {
      const val = (ema12[i] || 0) - (ema26[i] || 0);
      macdArray.push(val);
    }
    let signalArray = [];
    let prevSignal = macdArray[0] || 0;
    signalArray.push(prevSignal);
    const k = 2 / (9 + 1);
    for (let i = 1; i < macdArray.length; i++) {
      const curSignal = macdArray[i] * k + prevSignal * (1 - k);
      signalArray.push(curSignal);
      prevSignal = curSignal;
    }
    return { macd: macdArray, signal: signalArray };
  };

  // Process raw price points
  const rawHistory = coin.priceHistory7d || [];

  // Slice history based on timeframe
  const getSlicedHistory = () => {
    if (timeframe === '1H') return rawHistory.slice(-24); // last 24 points
    if (timeframe === '4H') return rawHistory.filter((_: any, idx: number) => idx % 4 === 0).slice(-24); // every 4th point
    if (timeframe === '1D') return rawHistory.filter((_: any, idx: number) => idx % 24 === 0); // daily points
    return rawHistory; // full 1W data
  };

  const activePoints = getSlicedHistory();

  const emaLineData = calculateEMA(activePoints, 12);
  const rsiLineData = calculateRSI(activePoints, 14);
  const { macd: macdLine, signal: signalLine } = calculateMACD(activePoints);

  // Compile charted points
  const chartData = activePoints.map((p: any, idx: number) => {
    const d = new Date(p.timestamp);
    const timeLabel = timeframe === '1H' || timeframe === '4H'
      ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    
    return {
      time: timeLabel,
      price: p.price,
      ema: emaLineData[idx] || null,
      rsi: rsiLineData[idx] || 50,
      macd: macdLine[idx] || 0,
      signal: signalLine[idx] || 0,
      histogram: (macdLine[idx] || 0) - (signalLine[idx] || 0),
    };
  });

  const handleWatchlist = async () => {
    try {
      if (watchlisted) {
        await api.removeFromWatchlist(coin.id);
      } else {
        await api.addToWatchlist(coin.id);
      }
      setWatchlisted(!watchlisted);
    } catch (e) { /* swallow */ }
  };

  const stats = [
    { label: 'Market Cap', value: formatUsd(coin.marketCapUsd ?? 0, true), icon: DollarSign },
    { label: '24h Volume', value: formatUsd(coin.volume24hUsd ?? 0, true), icon: BarChart3 },
    { label: '24h Change', value: formatPct(coin.change24hPct), icon: Activity, color: isUp ? 'var(--green-400)' : 'var(--red-400)' },
    { label: 'Rank', value: `#${coin.rank ?? '—'}`, icon: TrendingUp },
  ];

  return (
    <div className="coin-detail fade-in">
      <Link to="/markets" className="coin-detail__back">
        <ArrowLeft size={16} /> Back to Markets
      </Link>

      {/* Header */}
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
          <span className="coin-detail__price">{formatUsd(displayPrice)}</span>
          <span className={`coin-detail__change ${isUp ? 'text-green' : 'text-red'}`}>
            {isUp ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            {formatPct(coin.change24hPct)}
          </span>
        </div>
      </div>

      {/* Chart Workspace */}
      <div className="coin-detail__chart card">
        <div className="coin-detail__chart-header">
          <div className="flex items-center gap-md" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3>Interactive Trading Workspace</h3>
            {/* Chart Type Toggle */}
            <div className="coin-detail__chart-type-toggle">
              <button
                className={`coin-detail__chart-type-btn ${chartType === 'line' ? 'coin-detail__chart-type-btn--active' : ''}`}
                onClick={() => setChartType('line')}
              >Line</button>
              <button
                className={`coin-detail__chart-type-btn ${chartType === 'candle' ? 'coin-detail__chart-type-btn--active' : ''}`}
                onClick={() => setChartType('candle')}
              >Candle</button>
            </div>
            <div className="coin-detail__timeframe-selector">
              {(['1H', '4H', '1D', '1W'] as const).map((t) => (
                <button
                  key={t}
                  className={`coin-detail__timeframe-btn ${timeframe === t ? 'coin-detail__timeframe-btn--active' : ''}`}
                  onClick={() => setTimeframe(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          
          {/* Indicators Bar */}
          <div className="coin-detail__indicators-toggle">
            <button
              className={`coin-detail__indicator-btn ${showEMA ? 'coin-detail__indicator-btn--active' : ''}`}
              onClick={() => setShowEMA(!showEMA)}
            >
              EMA (12)
            </button>
            <button
              className={`coin-detail__indicator-btn ${showRSI ? 'coin-detail__indicator-btn--active' : ''}`}
              onClick={() => setShowRSI(!showRSI)}
            >
              RSI (14)
            </button>
            <button
              className={`coin-detail__indicator-btn ${showMACD ? 'coin-detail__indicator-btn--active' : ''}`}
              onClick={() => setShowMACD(!showMACD)}
            >
              MACD
            </button>
          </div>
        </div>

        {/* Primary Price Chart */}
        <div className="coin-detail__chart-area">
          {chartType === 'candle' ? (
            <CandlestickChart data={aggregateToOHLC(activePoints, 30)} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--text-muted)"
                  fontSize={10}
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
                  formatter={(value: any, name: any) => [formatUsd(Number(value) || 0), name === 'price' ? 'Price' : 'EMA(12)']}
                />
                <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#chartGradient)" dot={false} />
                {showEMA && (
                  <Line type="monotone" dataKey="ema" stroke="#f59e0b" strokeWidth={1.5} dot={false} activeDot={false} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* RSI Sub-chart */}
        {showRSI && (
          <div className="coin-detail__sub-chart">
            <div className="coin-detail__sub-title">RSI (14) Oscillator</div>
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                <XAxis dataKey="time" hide />
                <YAxis stroke="var(--text-muted)" fontSize={9} domain={[0, 100]} ticks={[30, 70]} tickLine={false} axisLine={false} width={70} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '0.75rem' }}
                  formatter={(v: any) => [Number(v).toFixed(2), 'RSI']}
                />
                <Line type="monotone" dataKey="rsi" stroke="#a855f7" strokeWidth={1.5} dot={false} activeDot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* MACD Sub-chart */}
        {showMACD && (
          <div className="coin-detail__sub-chart">
            <div className="coin-detail__sub-title">MACD (12, 26, 9)</div>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                <XAxis dataKey="time" hide />
                <YAxis stroke="var(--text-muted)" fontSize={9} tickLine={false} axisLine={false} width={70} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '0.75rem' }}
                  formatter={(v: any, name: any) => [Number(v).toFixed(4), name.toUpperCase()]}
                />
                <Bar dataKey="histogram" fill="#03c58b" radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="macd" stroke="#3b82f6" strokeWidth={1} dot={false} activeDot={false} />
                <Line type="monotone" dataKey="signal" stroke="#ef4444" strokeWidth={1} dot={false} activeDot={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Stats Grid */}
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

      {/* Trade Quick Widget */}
      <div className="coin-detail__trade card">
        <h3>Simulated CoinDCX Quick Trade Widget</h3>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
          Instantly buy or sell {coin.symbol} with simulated capital inside the transaction ledger.
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

      {/* Price Alerts */}
      <PriceAlerts symbol={coin.symbol} currentPrice={displayPrice} />
    </div>
  );
}
