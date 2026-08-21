import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Flame,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useCoins, useDebounce } from '../hooks/useMarketData';
import { useWebSocket } from '../hooks/useWebSocket';
import PriceCard from '../components/PriceCard';
import { CRYPTO_ICONS, ICON_COLORS } from '../components/PriceCard';
import Sparkline from '../components/Sparkline';
import { formatUsd, formatPct } from '../types';
import './Markets.css';

type ViewMode = 'table' | 'grid';
type SortField = 'rank' | 'priceUsd' | 'change24hPct' | 'marketCapUsd' | 'volume24hUsd';

export default function Markets() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';
  const initialTrending = searchParams.get('trending') === 'true';

  const [search, setSearch] = useState(initialSearch);
  const [showTrending, setShowTrending] = useState(initialTrending);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const debouncedSearch = useDebounce(search, 300);

  const { coins, loading } = useCoins({
    search: debouncedSearch || undefined,
    trending: showTrending || undefined,
    sort: sortField,
    order: sortOrder,
  });
  const { livePrices } = useWebSocket();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'rank' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      size={12}
      className={`sort-icon ${sortField === field ? 'sort-icon--active' : ''}`}
    />
  );

  return (
    <div className="markets fade-in">
      <div className="markets__header">
        <h1>Markets</h1>
        <p className="text-secondary">Track all {coins.length} available cryptocurrencies</p>
      </div>

      {/* ── Controls ── */}
      <div className="markets__controls">
        <div className="markets__search">
          <Search size={16} />
          <input
            id="market-search"
            type="text"
            placeholder="Search by name or symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="markets__filters">
          <button
            className={`btn btn-ghost ${showTrending ? 'markets__filter--active' : ''}`}
            onClick={() => setShowTrending(!showTrending)}
          >
            <Flame size={14} />
            Trending
          </button>

          <div className="markets__view-toggle">
            <button
              className={`btn btn-ghost ${viewMode === 'table' ? 'markets__view--active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table view"
            >
              <List size={16} />
            </button>
            <button
              className={`btn btn-ghost ${viewMode === 'grid' ? 'markets__view--active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className={viewMode === 'grid' ? 'markets__grid' : 'markets__loading'}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: viewMode === 'grid' ? 160 : 56, borderRadius: 12 }} />
          ))}
        </div>
      ) : coins.length === 0 ? (
        <div className="markets__empty card">
          <Search size={40} className="text-muted" style={{ marginBottom: 4 }} />
          <h3>No coins found</h3>
          <p className="text-secondary" style={{ marginBottom: 12 }}>Try a different search term or clear the filter</p>
          <button className="btn btn-secondary" onClick={() => setSearch('')}>
            Clear Search
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="markets__grid">
          {coins.map((coin, i) => (
            <PriceCard
              key={coin.id}
              coin={coin}
              livePrice={livePrices[coin.symbol]}
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      ) : (
        <div className="markets__table-wrap card">
          <table className="market-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('rank')} className="sortable">
                  # <SortIcon field="rank" />
                </th>
                <th>Coin</th>
                <th onClick={() => handleSort('priceUsd')} className="sortable">
                  Price <SortIcon field="priceUsd" />
                </th>
                <th onClick={() => handleSort('change24hPct')} className="sortable">
                  24h Change <SortIcon field="change24hPct" />
                </th>
                <th onClick={() => handleSort('marketCapUsd')} className="sortable">
                  Market Cap <SortIcon field="marketCapUsd" />
                </th>
                <th onClick={() => handleSort('volume24hUsd')} className="sortable">
                  Volume (24h) <SortIcon field="volume24hUsd" />
                </th>
                <th>Trending</th>
                <th>7d Chart</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((coin) => {
                const isUp = (coin.change24hPct ?? 0) >= 0;
                return (
                  <tr key={coin.id} className="fade-in">
                    <td className="text-muted">{coin.rank}</td>
                    <td>
                      <Link to={`/coin/${coin.symbol}`} className="market-table__coin">
                        <div
                          className="market-table__icon"
                          style={{
                            background: `${ICON_COLORS[coin.symbol] ?? 'var(--cyan-500)'}22`,
                            color: ICON_COLORS[coin.symbol] ?? 'var(--cyan-400)',
                          }}
                        >
                          {CRYPTO_ICONS[coin.symbol] ?? coin.symbol[0]}
                        </div>
                        <div className="market-table__coin-info">
                          <span className="market-table__symbol">{coin.symbol}</span>
                          <span className="market-table__name">{coin.name}</span>
                        </div>
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
                      {coin.isTrending && (
                        <span className="badge badge-amber">
                          <Flame size={10} /> Hot
                        </span>
                      )}
                    </td>
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
      )}
    </div>
  );
}
