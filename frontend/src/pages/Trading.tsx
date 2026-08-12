import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCoins, useOrders, useWallet } from '../hooks/useMarketData';
import { formatUsd } from '../types';
import * as api from '../api/client';
import { AlertCircle, X, ShieldAlert } from 'lucide-react';
import './Trading.css';

export default function Trading() {
  const [searchParams] = useSearchParams();
  const symbolParam = searchParams.get('symbol');
  const sideParam = searchParams.get('side');

  const { coins, loading: coinsLoading } = useCoins({ limit: 100 } as any);
  const { orders, loading: ordersLoading, refetch: refetchOrders } = useOrders();
  const { walletData, refetch: refetchWallet } = useWallet();

  // Form states
  const [selectedCoinId, setSelectedCoinId] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [type, setType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [limitPrice, setLimitPrice] = useState<number | ''>('');

  // Execution states
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Set default form values from query parameters or coins list
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

  const selectedCoin = coins.find((c) => c.id === selectedCoinId);

  // Auto-fill limit price with current price when switching to LIMIT
  useEffect(() => {
    if (type === 'LIMIT' && selectedCoin && !limitPrice) {
      setLimitPrice(Number(selectedCoin.priceUsd.toFixed(2)));
    }
  }, [type, selectedCoin, limitPrice]);

  // Calculate estimated total
  const priceToUse = type === 'MARKET' ? (selectedCoin?.priceUsd ?? 0) : Number(limitPrice || 0);
  const estTotal = priceToUse * (Number(quantity) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoinId || !quantity) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await api.placeOrder({
        coinId: selectedCoinId,
        side,
        type,
        quantity: Number(quantity),
        limitPrice: type === 'LIMIT' ? Number(limitPrice) : undefined,
      });

      setMessage({ text: res.message, type: 'success' });
      setQuantity('');
      if (type === 'MARKET') setLimitPrice('');
      refetchOrders();
      refetchWallet();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to place order', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.cancelOrder(orderId);
      setMessage({ text: 'Order cancelled successfully', type: 'success' });
      refetchOrders();
      refetchWallet();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to cancel order', type: 'error' });
    }
  };

  // Find asset balance in wallet holdings
  const currentAssetHolding = walletData?.holdings.find(h => h.coinId === selectedCoinId);
  const maxAvailable = currentAssetHolding?.amount ?? 0;

  return (
    <div className="trading fade-in">
      <div className="trading__header">
        <h1>Simulated Trading</h1>
        <p className="text-secondary">Execute MARKET and LIMIT orders without real capital risks</p>
      </div>

      {walletData?.wallet?.isShadow && (
        <div className="trading__shadow-warning">
          <ShieldAlert size={18} />
          <span><strong>Decoy Mode Active:</strong> Execution is isolated inside the Shadow state. Authentic portfolio is secure.</span>
        </div>
      )}

      <div className="trading__grid">
        {/* ── Order Form ── */}
        <div className="trading__form-container card">
          <h2>Place Order</h2>
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
              <label htmlFor="coin-select">Asset</label>
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

            {/* Balances detail */}
            {selectedCoin && (
              <div className="trading__balance-info">
                <span>Available:</span>
                <span className="font-semibold">
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
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
              </select>
            </div>

            {/* Limit Price */}
            {type === 'LIMIT' && (
              <div className="trading__field">
                <label htmlFor="limit-price-input">Limit Price (USD)</label>
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

            {/* Sell Max Helper */}
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
                <span>Price per asset:</span>
                <span className="font-semibold">{formatUsd(priceToUse)}</span>
              </div>
              <div className="trading__estimate-row trading__estimate-row--total">
                <span>Estimated Cost:</span>
                <span className="font-bold text-cyan">{formatUsd(estTotal)}</span>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className={`btn btn-primary trading__submit-btn ${side === 'SELL' ? 'btn-danger' : 'btn-success'}`}
              disabled={loading || !quantity || (type === 'LIMIT' && !limitPrice)}
            >
              {loading ? 'Processing...' : `${side} ${selectedCoin?.symbol ?? ''}`}
            </button>

            {/* Status alerts */}
            {message && (
              <div className={`trading__alert trading__alert--${message.type}`}>
                <AlertCircle size={16} />
                <span>{message.text}</span>
              </div>
            )}
          </form>
        </div>

        {/* ── Order History / Open Orders ── */}
        <div className="trading__history card">
          <h2>Order History</h2>
          {ordersLoading && orders.length === 0 ? (
            <div className="skeleton" style={{ height: 250, borderRadius: 12, marginTop: 12 }} />
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
                        <td className="text-muted" style={{ fontSize: '0.75rem' }}>
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
