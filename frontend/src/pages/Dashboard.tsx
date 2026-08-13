import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Activity,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCoins, useMarketStats } from '../hooks/useMarketData';
import PriceCard from '../components/PriceCard';
import { formatUsd, formatPct } from '../types';
import './Dashboard.css';

export default function Dashboard() {
  const { stats, loading: statsLoading } = useMarketStats();
  const { coins: trendingCoins, loading: trendingLoading } = useCoins({ trending: true });
  const { coins: topCoins, loading: topLoading } = useCoins({ sort: 'rank', order: 'asc', limit: 5 } as any);

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
      </div>

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
                        <td className="font-semibold">{formatUsd(coin.priceUsd)}</td>
                        <td>
                          <span className={`market-table__change ${isUp ? 'text-green' : 'text-red'}`}>
                            {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            {formatPct(coin.change24hPct)}
                          </span>
                        </td>
                        <td className="text-secondary">{formatUsd(coin.marketCapUsd ?? 0, true)}</td>
                        <td className="text-secondary">{formatUsd(coin.volume24hUsd ?? 0, true)}</td>
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
