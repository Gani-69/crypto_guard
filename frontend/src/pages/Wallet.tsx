import { useState } from 'react';
import { useWallet, useTransactions } from '../hooks/useMarketData';
import { formatUsd } from '../types';
import { Copy, Check, Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, ShieldAlert } from 'lucide-react';
import './Wallet.css';

export default function Wallet() {
  const { walletData, loading: walletLoading } = useWallet();
  const { transactions, loading: txLoading } = useTransactions(15);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (walletData?.wallet?.address) {
      navigator.clipboard.writeText(walletData.wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isLoading = walletLoading || txLoading;

  if (isLoading && !walletData) {
    return (
      <div className="wallet fade-in">
        <div className="skeleton" style={{ height: 180, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 400, borderRadius: 16, marginTop: 24 }} />
      </div>
    );
  }

  const wallet = walletData?.wallet;
  const holdings = walletData?.holdings ?? [];
  const totalValue = walletData?.totalValueUsd ?? 0;

  return (
    <div className="wallet fade-in">
      <div className="wallet__header">
        <h1>Wallet & Portfolio</h1>
        <p className="text-secondary">Simulated non-custodial devnet wallet</p>
      </div>

      {wallet?.isShadow && (
        <div className="wallet__shadow-warning">
          <ShieldAlert size={18} />
          <span><strong>Coercion State Detected:</strong> You are currently viewing isolated decoy balances.</span>
        </div>
      )}

      {/* ── Portfolio Balance Card ── */}
      <div className="wallet__balance-card card-glass">
        <div className="wallet__balance-left">
          <span className="wallet__balance-label">Total Portfolio Value</span>
          <span className="wallet__balance-value">{formatUsd(totalValue)}</span>
          {wallet && (
            <div className="wallet__address-row">
              <span className="wallet__address-title">Address:</span>
              <code className="wallet__address-value">{wallet.address}</code>
              <button className="wallet__copy-btn" onClick={handleCopy} title="Copy address">
                {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </div>
        <div className="wallet__balance-right">
          <div className="wallet__chain-badge">
            <span className="wallet__chain-dot" />
            <span>Devnet (Simulated)</span>
          </div>
        </div>
      </div>

      {/* ── Grid: Holdings & Transactions ── */}
      <div className="wallet__grid">
        {/* Holdings */}
        <div className="wallet__holdings card">
          <div className="wallet__section-header">
            <WalletIcon size={18} className="text-cyan" />
            <h2>Asset Holdings</h2>
          </div>
          {holdings.length === 0 ? (
            <div className="wallet__empty">
              <p className="text-muted">No assets held. Make a trade to acquire assets!</p>
            </div>
          ) : (
            <div className="wallet__table-wrap">
              <table className="wallet-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <div className="wallet__asset-cell">
                          <span className="wallet__asset-symbol">{h.symbol}</span>
                          <span className="wallet__asset-name">{h.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-semibold">
                        {h.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                      </td>
                      <td style={{ textAlign: 'right' }} className="text-secondary">
                        {formatUsd(h.priceUsd)}
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-semibold text-cyan">
                        {formatUsd(h.valueUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="wallet__transactions card">
          <div className="wallet__section-header">
            <ArrowUpRight size={18} className="text-purple-400" />
            <h2>Recent Activity</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="wallet__empty">
              <p className="text-muted">No transactions logged yet.</p>
            </div>
          ) : (
            <div className="wallet__tx-list">
              {transactions.map((tx) => {
                const isBuy = tx.type === 'BUY';
                return (
                  <div key={tx.id} className="wallet__tx-item">
                    <div className={`wallet__tx-icon ${isBuy ? 'wallet__tx-icon--buy' : 'wallet__tx-icon--sell'}`}>
                      {isBuy ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div className="wallet__tx-info">
                      <span className="wallet__tx-title">
                        {isBuy ? 'Bought' : 'Sold'} {tx.coinSymbol}
                      </span>
                      <span className="wallet__tx-date">
                        {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="wallet__tx-amounts">
                      <span className={`wallet__tx-amount ${isBuy ? 'text-green' : 'text-red'}`}>
                        {isBuy ? '+' : '-'}{tx.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {tx.coinSymbol}
                      </span>
                      <span className="wallet__tx-value">
                        {formatUsd(tx.totalUsd)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
