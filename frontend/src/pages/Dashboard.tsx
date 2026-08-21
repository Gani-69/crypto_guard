import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Activity,
  Flame,
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCoins, useMarketStats, useWallet } from '../hooks/useMarketData';
import { useWebSocket } from '../hooks/useWebSocket';
import PriceCard from '../components/PriceCard';
import Sparkline from '../components/Sparkline';
import FearGreedGauge from '../components/FearGreedGauge';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatUsd, formatPct } from '../types';
import './Dashboard.css';

export default function Dashboard() {
  const { stats, loading: statsLoading } = useMarketStats();
  const { coins: trendingCoins, loading: trendingLoading } = useCoins({ trending: true });
  const { coins: topCoins, loading: topLoading } = useCoins({ sort: 'rank', order: 'asc', limit: 5 } as any);
  const { livePrices, connected } = useWebSocket();
  const { walletData } = useWallet(false); // always fetch real wallet for portfolio display

  const statCards = [
    {
      label: 'Total Market Cap',
      value: statsLoading ? (
        <span className="skeleton" style={{ display: 'inline-block', height: 20, width: 90, marginTop: 4 }} />
      ) : stats ? (
        formatUsd(stats.totalMarketCap, true)
      ) : (
        '—'
      ),
      icon: DollarSign,
      color: 'var(--cyan-400)',
      bg: 'rgba(6, 182, 212, 0.1)',
    },
    {
      label: '24h Volume',
      value: statsLoading ? (
        <span className="skeleton" style={{ display: 'inline-block', height: 20, width: 90, marginTop: 4 }} />
      ) : stats ? (
        formatUsd(stats.totalVolume24h, true)
      ) : (
        '—'
      ),
      icon: BarChart3,
      color: 'var(--blue-400)',
      bg: 'rgba(96, 165, 250, 0.1)',
    },
    {
      label: 'Avg 24h Change',
      value: statsLoading ? (
        <span className="skeleton" style={{ display: 'inline-block', height: 20, width: 65, marginTop: 4 }} />
      ) : stats ? (
        formatPct(stats.avgChange24h)
      ) : (
        '—'
      ),
      icon: Activity,
      color: stats && stats.avgChange24h >= 0 ? 'var(--green-400)' : 'var(--red-400)',
      bg: stats && stats.avgChange24h >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    },
    {
      label: 'Gainers / Losers',
      value: statsLoading ? (
        <span className="skeleton" style={{ display: 'inline-block', height: 20, width: 60, marginTop: 4 }} />
      ) : stats ? (
        `${stats.gainers} / ${stats.losers}`
      ) : (
        '—'
      ),
      icon: TrendingUp,
      color: 'var(--green-400)',
      bg: 'rgba(34, 197, 94, 0.1)',
    },
  ];

  return (
    <div className="dashboard fade-in">
      <div className="dashboard__hero">
        <div className="dashboard__hero-text">
          <h1>Market Overview</h1>
          <p className="text-secondary">Real-time crypto market data with ARES adaptive security</p>
        </div>
        {connected && (
          <div className="dashboard__live-badge">
            <span className="telemetry-pulse-dot" />
            <span>LIVE</span>
          </div>
        )}
      </div>

      {/* ── Portfolio + Fear & Greed Row ── */}
      {walletData && (
        <div className="dashboard__portfolio-row">
          {/* Portfolio Hero */}
          {walletData.holdings.filter((h) => h.valueUsd > 0).length > 0 ? (
            <div className="dashboard__portfolio card-glass">
              <div className="dashboard__portfolio-header">
                <div>
                  <div className="dashboard__portfolio-label">My Portfolio</div>
                  <div className="dashboard__portfolio-value">{formatUsd(walletData.totalValueUsd)}</div>
                </div>
                <div className="dashboard__portfolio-actions">
                  <Link to="/wallet" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '6px 14px' }}>
                    <ArrowDownLeft size={13} /> Deposit
                  </Link>
                  <Link to="/trading" className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '6px 14px' }}>
                    <ArrowUpRight size={13} /> Trade
                  </Link>
                </div>
              </div>

              <div className="dashboard__portfolio-body">
                {/* Donut chart */}
                <div className="dashboard__donut-wrap">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={walletData.holdings.filter((h) => h.valueUsd > 0)}
                        dataKey="valueUsd"
                        nameKey="symbol"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={2}
                      >
                        {walletData.holdings
                          .filter((h) => h.valueUsd > 0)
                          .map((_, idx) => {
                            const colors = [
                              'var(--cyan-400)',
                              'var(--blue-400)',
                              'var(--green-400)',
                              'var(--purple-400)',
                              'var(--amber-400)',
                              'var(--red-400)',
                            ];
                            return <Cell key={idx} fill={colors[idx % colors.length]} />;
                          })}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any) => [formatUsd(Number(value)), name]}
                        contentStyle={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Holdings pills */}
                <div className="dashboard__holdings">
                  {walletData.holdings
                    .filter((h) => h.valueUsd > 0)
                    .slice(0, 5)
                    .map((h, idx) => {
                      const colors = [
                        'var(--cyan-400)',
                        'var(--blue-400)',
                        'var(--green-400)',
                        'var(--purple-400)',
                        'var(--amber-400)',
                      ];
                      const pct =
                        walletData.totalValueUsd > 0
                          ? ((h.valueUsd / walletData.totalValueUsd) * 100).toFixed(1)
                          : '0';
                      return (
                        <div key={h.coinId} className="dashboard__holding-pill">
                          <span className="dashboard__holding-dot" style={{ background: colors[idx % colors.length] }} />
                          <span className="dashboard__holding-sym">{h.symbol}</span>
                          <span className="dashboard__holding-pct">{pct}%</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className="dashboard__portfolio card-glass flex flex-col justify-between" style={{ padding: 24 }}>
              <div>
                <div className="dashboard__portfolio-label">Trading Portfolio Balance</div>
                <div className="dashboard__portfolio-value" style={{ color: 'var(--cyan-400)' }}>₹0.00</div>
                <p className="text-secondary mt-xs" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
                  Welcome! Complete KYC verification in your wallet and deposit simulated INR via PhonePe / UPI to start trading.
                </p>
              </div>
              <div className="flex gap-sm mt-md">
                <Link to="/wallet" className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '6px 14px' }}>
                  <ArrowDownLeft size={13} /> Complete KYC &amp; Deposit
                </Link>
                <Link to="/markets" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '6px 14px' }}>
                  Explore Markets
                </Link>
              </div>
            </div>
          )}

          {/* Fear & Greed Gauge */}
          {stats && (
            <div className="dashboard__fear-greed-card card-glass">
              <FearGreedGauge
                avgChange24h={stats.avgChange24h}
                gainers={stats.gainers}
                losers={stats.losers}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Stats Row ── */}
      <div className="dashboard__stats">
        {statCards.map((s) => (
          <div key={s.label} className="stat-card card">
            <div className="stat-card__icon" style={{ background: s.bg, color: s.color }}>
              <s.icon size={20} />
            </div>
            <div className="stat-card__content">
              <span className="stat-card__label">{s.label}</span>
              <span className="stat-card__value" style={{ color: s.color }}>{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Trending Section ── */}
      <section className="dashboard__section">
        <div className="dashboard__section-header">
          <div className="dashboard__section-title">
            <Flame size={20} className="text-amber" />
            <h2>Trending Now</h2>
          </div>
          <Link to="/markets?trending=true" className="dashboard__view-all">
            View All <ArrowRight size={14} />
          </Link>
        </div>
        <div className="dashboard__trending-grid">
          {trendingLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card skeleton" style={{ height: 160 }} />
              ))
            : trendingCoins.map((coin, i) => (
                <PriceCard
                  key={coin.id}
                  coin={coin}
                  livePrice={livePrices[coin.symbol]}
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))}
        </div>
      </section>

      {/* ── Top Coins Table ── */}
      <section className="dashboard__section">
        <div className="dashboard__section-header">
          <div className="dashboard__section-title">
            <BarChart3 size={20} className="text-cyan" />
            <h2>Top by Market Cap</h2>
          </div>
          <Link to="/markets" className="dashboard__view-all">
            See All Markets <ArrowRight size={14} />
          </Link>
        </div>
        <div className="dashboard__table-wrap card">
          <table className="market-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Coin</th>
                <th>Price</th>
                <th>24h Change</th>
                <th>Market Cap</th>
                <th>Volume (24h)</th>
                <th>7d Chart</th>
              </tr>
            </thead>
            <tbody>
              {topLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td><div className="skeleton" style={{ height: 16, width: 16 }} /></td>
                      <td>
                        <div className="flex items-center gap-sm">
                          <div className="skeleton" style={{ height: 20, width: 40, borderRadius: 4 }} />
                          <div className="skeleton" style={{ height: 16, width: 80 }} />
                        </div>
                      </td>
                      <td><div className="skeleton" style={{ height: 16, width: 70 }} /></td>
                      <td><div className="skeleton" style={{ height: 16, width: 50 }} /></td>
                      <td><div className="skeleton" style={{ height: 16, width: 80 }} /></td>
                      <td><div className="skeleton" style={{ height: 16, width: 80 }} /></td>
                      <td><div className="skeleton" style={{ height: 24, width: 72, borderRadius: 4 }} /></td>
                    </tr>
                  ))
                : topCoins.map((coin) => {
                    const isUp = (coin.change24hPct ?? 0) >= 0;
                    return (
                      <tr key={coin.id}>
                        <td className="text-muted">{coin.rank}</td>
                        <td>
                          <Link to={`/coin/${coin.symbol}`} className="market-table__coin">
                            <span className="market-table__symbol">{coin.symbol}</span>
                            <span className="market-table__name">{coin.name}</span>
                          </Link>
                        </td>
                        <td className="font-semibold">{formatUsd(livePrices[coin.symbol] ?? coin.priceUsd)}</td>
                        <td>
                          <span className={`market-table__change ${isUp ? 'text-green' : 'text-red'}`}>
                            {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            {formatPct(coin.change24hPct)}
                          </span>
                        </td>
                        <td className="text-secondary">{formatUsd(coin.marketCapUsd ?? 0, true)}</td>
                        <td className="text-secondary">{formatUsd(coin.volume24hUsd ?? 0, true)}</td>
                        <td>
                          <Sparkline
                            prices={coin.sparkline ?? []}
                            positive={(coin.change24hPct ?? 0) >= 0}
                            width={72}
                            height={28}
                          />
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
