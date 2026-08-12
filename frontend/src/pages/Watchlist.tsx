import { Star, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWatchlist } from '../hooks/useMarketData';
import { CRYPTO_ICONS, ICON_COLORS } from '../components/PriceCard';
import { formatUsd, formatPct } from '../types';
import * as api from '../api/client';
import './Watchlist.css';

export default function Watchlist() {
  const { watchlist, loading, refetch } = useWatchlist();

  const handleRemove = async (coinId: string) => {
    try {
      await api.removeFromWatchlist(coinId);
      refetch();
    } catch (e) { /* swallow */ }
  };

  return (
    <div className="watchlist fade-in">
      <div className="watchlist__header">
        <div>
          <h1>
            <Star size={24} className="text-amber" style={{ marginRight: 10, verticalAlign: 'middle' }} />
            Watchlist
          </h1>
          <p className="text-secondary">Your saved cryptocurrencies</p>
        </div>
      </div>

      {loading ? (
        <div className="watchlist__loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />
          ))}
        </div>
      ) : watchlist.length === 0 ? (
        <div className="watchlist__empty card">
          <Star size={48} className="text-muted" />
          <h3>Your watchlist is empty</h3>
          <p className="text-muted">Add coins from the Markets page to track them here</p>
          <Link to="/markets" className="btn btn-primary">Browse Markets</Link>
        </div>
      ) : (
        <div className="watchlist__list">
          {watchlist.map((coin) => {
            const isUp = (coin.change24hPct ?? 0) >= 0;
            return (
              <div key={coin.id} className="watchlist__item card">
                <Link to={`/coin/${coin.symbol}`} className="watchlist__item-main">
                  <div
                    className="watchlist__icon"
                    style={{
                      background: `${ICON_COLORS[coin.symbol] ?? 'var(--cyan-500)'}22`,
                      color: ICON_COLORS[coin.symbol] ?? 'var(--cyan-400)',
                    }}
                  >
                    {CRYPTO_ICONS[coin.symbol] ?? coin.symbol[0]}
                  </div>
                  <div className="watchlist__info">
                    <span className="watchlist__symbol">{coin.symbol}</span>
                    <span className="watchlist__name">{coin.name}</span>
                  </div>
                  <div className="watchlist__price-area">
                    <span className="watchlist__price">{formatUsd(coin.priceUsd)}</span>
                    <span className={`watchlist__change ${isUp ? 'text-green' : 'text-red'}`}>
                      {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {formatPct(coin.change24hPct)}
                    </span>
                  </div>
                  <div className="watchlist__meta">
                    <span>MCap {formatUsd(coin.marketCapUsd ?? 0, true)}</span>
                    <span>Vol {formatUsd(coin.volume24hUsd ?? 0, true)}</span>
                  </div>
                </Link>
                <button
                  className="watchlist__remove btn btn-ghost"
                  onClick={() => handleRemove(coin.id)}
                  title="Remove from watchlist"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
