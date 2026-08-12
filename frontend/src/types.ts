/* ── API types matching the backend Prisma models ── */

export interface Coin {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
  logoUrl: string | null;
  rank: number | null;
  isTrending: boolean;
}

export interface CoinDetail extends Coin {
  priceHistory7d: PricePoint[];
  lastUpdatedAt: string;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface MarketStats {
  totalCoins: number;
  totalMarketCap: number;
  totalVolume24h: number;
  avgChange24h: number;
  gainers: number;
  losers: number;
}

export interface WatchlistCoin extends Coin {
  addedAt: string;
}

// ── Wallet & Trading (Block C) ──

export interface WalletInfo {
  id: string;
  address: string;
  chain: string;
  isShadow: boolean;
  createdAt: string;
}

export interface Holding {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
  change24hPct: number | null;
  logoUrl: string | null;
}

export interface WalletData {
  wallet: WalletInfo | null;
  holdings: Holding[];
  totalValueUsd: number;
}

export interface Order {
  id: string;
  coinId: string;
  coinSymbol: string;
  coinName: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  limitPrice: number | null;
  fillPrice: number | null;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  totalUsd: number | null;
  isShadow: boolean;
  createdAt: string;
  filledAt: string | null;
}

export interface Transaction {
  id: string;
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL';
  coinId: string;
  coinSymbol: string;
  coinName: string;
  amount: number;
  priceUsd: number;
  totalUsd: number;
  isShadow: boolean;
  createdAt: string;
}

export interface OrderResult {
  order: Order;
  message: string;
}

// Utility
export function formatUsd(value: number, compact?: boolean): string {
  if (compact) {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  }
  if (value >= 1) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

export function formatPct(value: number | null): string {
  if (value === null || value === undefined) return '0.00%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
