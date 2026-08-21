import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useCoins, useOrders, useWallet } from '../hooks/useMarketData';
import { formatUsd, formatPct } from '../types';
import * as api from '../api/client';
import { X, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNotifications } from '../context/NotificationContext';
import './Trading.css';

export default function Trading() {
  const { isUnlocked, user } = useAuth();
  const decoyMode = !isUnlocked;
  const isKycVerified =
    user?.kycStatus === 'VERIFIED' ||
    user?.email === 'demo@cryptoguard.dev' ||
    user?.email === 'admin@cryptoguard.dev';

  const [searchParams] = useSearchParams();
  const symbolParam = searchParams.get('symbol');
  const sideParam = searchParams.get('side');

  const { coins, loading: coinsLoading } = useCoins({ limit: 100 } as any);
  const { orders, loading: ordersLoading, refetch: refetchOrders } = useOrders({ decoy: decoyMode });
  const { walletData, refetch: refetchWallet } = useWallet(decoyMode);

  // Form states
  const [selectedCoinId, setSelectedCoinId] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [type, setType] = useState<'MARKET' | 'LIMIT' | 'STOP_LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [limitPrice, setLimitPrice] = useState<number | ''>('');
  const [stopPrice, setStopPrice] = useState<number | ''>('');

  const { showToast } = useToast();
  const { addNotification } = useNotifications();

  // Execution states
  const [loading, setLoading] = useState(false);

  // Simulated Order Book bids and asks
  const [bids, setBids] = useState<Array<{ price: number; qty: number }>>([]);
  const [asks, setAsks] = useState<Array<{ price: number; qty: number }>>([]);

  const selectedCoin = coins.find((c) => c.id === selectedCoinId);

  // Sync symbol query parameters
  useEffect(() => {
    if (coins.length > 0) {
      if (symbolParam) {
        const coin = coins.find((c) => c.symbol === symbolParam.toUpperCase());
        if (coin) setSelectedCoinId(coin.id);
      } else if (!selectedCoinId) {
        setSelectedCoinId(coins[0].id);
      }
    }
  }, [coins, symbolParam, selectedCoinId]);

  useEffect(() => {
    if (sideParam === 'BUY' || sideParam === 'SELL') {
      setSide(sideParam);
    }
  }, [sideParam]);

  // Autofill limit price when switching type
  useEffect(() => {
    if ((type === 'LIMIT' || type === 'STOP_LIMIT') && selectedCoin && !limitPrice) {
      setLimitPrice(Number(selectedCoin.priceUsd.toFixed(2)));
    }
    if (type === 'STOP_LIMIT' && selectedCoin && !stopPrice) {
      setStopPrice(Number((selectedCoin.priceUsd * 0.99).toFixed(2)));
    }
  }, [type, selectedCoin, limitPrice, stopPrice]);

  // Simulate dynamic Order Book fluctuations
  useEffect(() => {
    if (!selectedCoin) return;
    const basePrice = selectedCoin.priceUsd;

    const generateInitialBook = () => {
      const tempAsks = [];
      const tempBids = [];
      for (let i = 1; i <= 5; i++) {
        tempAsks.push({
          price: basePrice * (1 + (i * 0.0006) + (Math.random() - 0.5) * 0.0002),
          qty: Math.random() * 1.8 + 0.05,
        });
        tempBids.push({
          price: basePrice * (1 - (i * 0.0006) + (Math.random() - 0.5) * 0.0002),
          qty: Math.random() * 1.8 + 0.05,
        });
      }
      setAsks(tempAsks.sort((a, b) => a.price - b.price));
      setBids(tempBids.sort((a, b) => b.price - a.price));
    };

    generateInitialBook();

    const interval = setInterval(() => {
      setAsks((prev) =>
        prev
          .map((item) => ({
            price: item.price * (1 + (Math.random() - 0.5) * 0.00008),
            qty: Math.max(0.005, item.qty + (Math.random() - 0.5) * 0.12),
          }))
          .sort((a, b) => a.price - b.price)
      );

      setBids((prev) =>
        prev
          .map((item) => ({
            price: item.price * (1 + (Math.random() - 0.5) * 0.00008),
            qty: Math.max(0.005, item.qty + (Math.random() - 0.5) * 0.12),
          }))
          .sort((a, b) => b.price - a.price)
      );
    }, 1500);

    return () => clearInterval(interval);
  }, [selectedCoinId, selectedCoin]);

  const handleOrderBookClick = (price: number, qty: number, clickSide: 'BUY' | 'SELL') => {
    setSide(clickSide === 'BUY' ? 'SELL' : 'BUY'); // Counterparty action
    setLimitPrice(Number(price.toFixed(2)));
    setQuantity(Number(qty.toFixed(4)));
    if (type === 'MARKET') setType('LIMIT');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isKycVerified) {
      showToast('Please complete KYC verification in Wallet before trading.', 'warning');
      return;
    }
    if (!selectedCoinId || !quantity) return;

    setLoading(true);

    try {
      const res = await api.placeOrder({
        coinId: selectedCoinId,
        side,
        type,
        quantity: Number(quantity),
        limitPrice: type === 'LIMIT' || type === 'STOP_LIMIT' ? Number(limitPrice) : undefined,
        stopPrice: type === 'STOP_LIMIT' ? Number(stopPrice) : undefined,
        decoy: decoyMode,
      });

      showToast(res.message, 'success');
      addNotification({
        title: `${side} Order Placed`,
        body: `${side} ${quantity} ${selectedCoin?.symbol ?? ''} (${type})`,
        type: 'trade',
      });
      setQuantity('');
      if (type === 'MARKET') {
        setLimitPrice('');
        setStopPrice('');
      }
      refetchOrders();
      refetchWallet();
    } catch (err: any) {
      showToast(err.message || 'Failed to place order', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.cancelOrder(orderId, decoyMode);
      showToast('Order cancelled successfully', 'success');
      addNotification({
        title: 'Order Cancelled',
        body: `Order ${orderId.slice(0, 8)} was cancelled`,
        type: 'trade',
      });
      refetchOrders();
      refetchWallet();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel order', 'error');
    }
  };

  const priceToUse = type === 'MARKET' ? (selectedCoin?.priceUsd ?? 0) : Number(limitPrice || 0);
  const estTotal = priceToUse * (Number(quantity) || 0);

  const currentAssetHolding = walletData?.holdings.find((h) => h.coinId === selectedCoinId);
  const maxAvailable = currentAssetHolding?.amount ?? 0;

  return (
    <div className="trading fade-in">
      {/* ── Active Asset Stats Header Bar ── */}
      {selectedCoin && (
        <div className="trading__asset-bar card">
          <div className="trading__asset-info">
            <span className="trading__asset-symbol">{selectedCoin.symbol} / INR</span>
            <span className="trading__asset-price">{formatUsd(selectedCoin.priceUsd)}</span>
            <span className={`trading__asset-change ${(selectedCoin.change24hPct ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
              {formatPct(selectedCoin.change24hPct)}
            </span>
          </div>
          <div className="trading__asset-stats">
            <div className="trading__stat-item">
              <span className="trading__stat-label">24h High</span>
              <span className="trading__stat-value">{formatUsd(selectedCoin.priceUsd * 1.03)}</span>
            </div>
            <div className="trading__stat-item">
              <span className="trading__stat-label">24h Low</span>
              <span className="trading__stat-value">{formatUsd(selectedCoin.priceUsd * 0.97)}</span>
            </div>
            <div className="trading__stat-item">
              <span className="trading__stat-label">24h Volume</span>
              <span className="trading__stat-value">{formatUsd(selectedCoin.volume24hUsd ?? 0, true)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Monolithic Trade Grid ── */}
      <div className="trading__main-grid">
        {/* Left Column: Live Order Book */}
        <div className="trading__book card">
          <h3 className="trading__title">Order Book</h3>
          <div className="trading__book-headers">
            <span>Price (INR)</span>
            <span style={{ textAlign: 'right' }}>Size ({selectedCoin?.symbol})</span>
            <span style={{ textAlign: 'right' }}>Total (INR)</span>
          </div>

          {/* Asks (Sells) */}
          <div className="trading__book-section trading__book-section--asks">
            {asks.slice().reverse().map((ask, idx) => {
              const depthPct = Math.min(100, (ask.qty / 2.5) * 100);
              return (
                <div
                  key={idx}
                  className="trading__book-row trading__book-row--ask"
                  onClick={() => handleOrderBookClick(ask.price, ask.qty, 'SELL')}
                  style={{ background: `linear-gradient(270deg, rgba(244, 67, 54, 0.08) ${depthPct}%, transparent 0%)` }}
                >
                  <span className="text-red font-mono">{formatUsd(ask.price)}</span>
                  <span style={{ textAlign: 'right' }} className="font-mono">{ask.qty.toFixed(4)}</span>
                  <span style={{ textAlign: 'right' }} className="font-mono text-secondary">{formatUsd(ask.price * ask.qty)}</span>
                </div>
              );
            })}
          </div>

          {/* Index Price */}
          {selectedCoin && (
            <div className="trading__book-index">
              <span className={`trading__index-price ${(selectedCoin.change24hPct ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                {formatUsd(selectedCoin.priceUsd)}
                {(selectedCoin.change24hPct ?? 0) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
              </span>
            </div>
          )}

          {/* Bids (Buys) */}
          <div className="trading__book-section trading__book-section--bids">
            {bids.map((bid, idx) => {
              const depthPct = Math.min(100, (bid.qty / 2.5) * 100);
              return (
                <div
                  key={idx}
                  className="trading__book-row trading__book-row--bid"
                  onClick={() => handleOrderBookClick(bid.price, bid.qty, 'BUY')}
                  style={{ background: `linear-gradient(270deg, rgba(3, 197, 139, 0.08) ${depthPct}%, transparent 0%)` }}
                >
                  <span className="text-green font-mono">{formatUsd(bid.price)}</span>
                  <span style={{ textAlign: 'right' }} className="font-mono">{bid.qty.toFixed(4)}</span>
                  <span style={{ textAlign: 'right' }} className="font-mono text-secondary">{formatUsd(bid.price * bid.qty)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Column: Place Order Form */}
        <div className="trading__form-container card">
          <h3 className="trading__title">Order Placement</h3>
          <form onSubmit={handleSubmit} className="trading__form">
            {/* Side selector */}
            <div className="trading__tab-selector">
              <button
                type="button"
                className={`trading__tab-btn trading__tab-btn--buy ${side === 'BUY' ? 'trading__tab-btn--buy-active' : ''}`}
                onClick={() => setSide('BUY')}
              >
                Buy
              </button>
              <button
                type="button"
                className={`trading__tab-btn trading__tab-btn--sell ${side === 'SELL' ? 'trading__tab-btn--sell-active' : ''}`}
                onClick={() => setSide('SELL')}
              >
                Sell
              </button>
            </div>

            {/* Asset selector */}
            <div className="trading__field">
              <label htmlFor="coin-select">Asset Pair</label>
              <select
                id="coin-select"
                value={selectedCoinId}
                onChange={(e) => setSelectedCoinId(e.target.value)}
                disabled={coinsLoading}
              >
                {coins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.symbol}) — {formatUsd(c.priceUsd)}
                  </option>
                ))}
              </select>
            </div>

            {/* Available balance */}
            {selectedCoin && (
              <div className="trading__balance-info">
                <span>Holdings:</span>
                <span className="font-semibold text-cyan">
                  {maxAvailable.toLocaleString(undefined, { maximumFractionDigits: 6 })} {selectedCoin.symbol}
                </span>
              </div>
            )}

            {/* Order type */}
            <div className="trading__field">
              <label htmlFor="type-select">Order Type</label>
              <select
                id="type-select"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                <option value="MARKET">Market Order</option>
                <option value="LIMIT">Limit Order</option>
                <option value="STOP_LIMIT">Stop-Loss Limit</option>
              </select>
            </div>

            {/* Stop Price */}
            {type === 'STOP_LIMIT' && (
              <div className="trading__field">
                <label htmlFor="stop-price-input">Stop Price (INR)</label>
                <input
                  id="stop-price-input"
                  type="number"
                  step="any"
                  min="0.000001"
                  placeholder="Stop Price (Trigger)"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                />
              </div>
            )}

            {/* Limit Price */}
            {(type === 'LIMIT' || type === 'STOP_LIMIT') && (
              <div className="trading__field">
                <label htmlFor="limit-price-input">Limit Price (INR)</label>
                <input
                  id="limit-price-input"
                  type="number"
                  step="any"
                  min="0.000001"
                  placeholder="Price"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                />
              </div>
            )}

            {/* Quantity */}
            <div className="trading__field">
              <label htmlFor="quantity-input">Quantity</label>
              <div className="trading__input-with-symbol">
                <input
                  id="quantity-input"
                  type="number"
                  step="any"
                  min="0.000001"
                  placeholder="Amount"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                />
                <span className="trading__input-coin-symbol">
                  {selectedCoin?.symbol ?? ''}
                </span>
              </div>
            </div>

            {/* Max helper */}
            {side === 'SELL' && maxAvailable > 0 && (
              <button
                type="button"
                className="trading__max-btn"
                onClick={() => setQuantity(maxAvailable)}
              >
                Sell Max ({maxAvailable.toLocaleString(undefined, { maximumFractionDigits: 6 })})
              </button>
            )}

            {/* Order estimates */}
            <div className="trading__estimates">
              <div className="trading__estimate-row">
                <span>Est Price:</span>
                <span className="font-semibold">{formatUsd(priceToUse)}</span>
              </div>
              <div className="trading__estimate-row trading__estimate-row--total">
                <span>Total Value:</span>
                <span className="font-bold text-cyan">{formatUsd(estTotal)}</span>
              </div>
            </div>

            {/* KYC Notice if pending */}
            {!isKycVerified && (
              <div
                style={{
                  background: 'rgba(251, 191, 36, 0.08)',
                  border: '1px solid rgba(251, 191, 36, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <p className="text-amber font-semibold" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
                  KYC Verification Required
                </p>
                <p className="text-secondary" style={{ fontSize: '0.72rem', marginBottom: 8, lineHeight: 1.4 }}>
                  Complete identity &amp; real-time payment linking to activate order placement.
                </p>
                <Link
                  to="/wallet"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '4px 10px', display: 'inline-flex' }}
                >
                  Verify KYC in Wallet &rarr;
                </Link>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className={`btn trading__submit-btn ${side === 'SELL' ? 'btn-danger' : 'btn-success'}`}
              disabled={loading || !quantity || ((type === 'LIMIT' || type === 'STOP_LIMIT') && !limitPrice) || (type === 'STOP_LIMIT' && !stopPrice)}
            >
              {loading ? 'Processing...' : `${side} ${selectedCoin?.symbol ?? ''}`}
            </button>
          </form>
        </div>

        {/* Right Column: Order History */}
        <div className="trading__history card">
          <h3 className="trading__title">Order History</h3>
          {ordersLoading && orders.length === 0 ? (
            <p className="text-muted" style={{ padding: 20 }}>Loading orders...</p>
          ) : orders.length === 0 ? (
            <div className="trading__empty">
              <p className="text-muted">No orders submitted yet.</p>
            </div>
          ) : (
            <div className="trading__table-wrap">
              <table className="trading-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Side</th>
                    <th>Asset</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const isBuy = o.side === 'BUY';
                    const isFilled = o.status === 'FILLED';
                    const isOpen = o.status === 'OPEN';
                    return (
                      <tr key={o.id}>
                        <td className="text-secondary" style={{ fontSize: '0.75rem' }}>
                          {new Date(o.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <span className="trading__type-badge">{o.type}</span>
                        </td>
                        <td>
                          <span className={`trading__side-badge ${isBuy ? 'trading__side-badge--buy' : 'trading__side-badge--sell'}`}>
                            {o.side}
                          </span>
                        </td>
                        <td className="font-semibold">{o.coinSymbol}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono">
                          {o.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono text-secondary">
                          {formatUsd(isFilled ? (o.fillPrice ?? 0) : (o.limitPrice ?? 0))}
                        </td>
                        <td>
                          <span className={`badge ${isFilled ? 'badge-green' : isOpen ? 'badge-amber' : 'badge-red'}`}>
                            {o.status}
                          </span>
                        </td>
                        <td>
                          {isOpen && (
                            <button
                              onClick={() => handleCancelOrder(o.id)}
                              className="trading__cancel-btn btn btn-ghost"
                              title="Cancel Order"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
