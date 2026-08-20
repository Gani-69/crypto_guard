/* ── CryptoGuard API Client ──────────────────────────────────────────
   Wraps fetch for backend communication. In dev, Vite proxies /api 
   to :4000 via vite.config.ts. In production, same origin.
   ──────────────────────────────────────────────────────────────── */

import type { Coin, CoinDetail, MarketStats, WatchlistCoin, WalletData, Order, Transaction, OrderResult } from '../types';

const BASE = '/api';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Market ──

export async function getCoins(params?: {
  search?: string;
  trending?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}): Promise<{ coins: Coin[]; count: number }> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.trending) qs.set('trending', 'true');
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.order) qs.set('order', params.order);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return fetchJson(`/market/coins${query ? `?${query}` : ''}`);
}

export async function getCoin(idOrSymbol: string): Promise<CoinDetail> {
  return fetchJson(`/market/coins/${idOrSymbol}`);
}

export async function getMarketStats(): Promise<MarketStats> {
  return fetchJson('/market/stats');
}

export async function getWatchlist(): Promise<{ watchlist: WatchlistCoin[] }> {
  return fetchJson('/market/watchlist');
}

export async function addToWatchlist(coinId: string): Promise<{ status: string }> {
  return fetchJson('/market/watchlist', {
    method: 'POST',
    body: JSON.stringify({ coinId }),
  });
}

export async function removeFromWatchlist(coinId: string): Promise<{ status: string }> {
  return fetchJson(`/market/watchlist/${coinId}`, { method: 'DELETE' });
}

// ── Wallet ──

export async function getWallet(decoy?: boolean): Promise<WalletData> {
  return fetchJson(`/wallet${decoy ? '?decoy=true' : ''}`);
}

export async function getTransactions(limit?: number, decoy?: boolean): Promise<{ transactions: Transaction[] }> {
  const qs = new URLSearchParams();
  if (limit) qs.set('limit', String(limit));
  if (decoy) qs.set('decoy', 'true');
  const query = qs.toString();
  return fetchJson(`/wallet/transactions${query ? `?${query}` : ''}`);
}

// ── Trading ──

export async function placeOrder(order: {
  coinId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  decoy?: boolean;
}): Promise<OrderResult> {
  return fetchJson('/trading/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

export async function getOrders(params?: { limit?: number; status?: string; decoy?: boolean }): Promise<{ orders: Order[] }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  if (params?.decoy) qs.set('decoy', 'true');
  const query = qs.toString();
  return fetchJson(`/trading/orders${query ? `?${query}` : ''}`);
}

export async function cancelOrder(orderId: string, decoy?: boolean): Promise<{ status: string }> {
  return fetchJson(`/trading/orders/${orderId}/cancel`, { 
    method: 'POST',
    body: JSON.stringify({ decoy })
  });
}

export async function createTransaction(data: { type: 'DEPOSIT' | 'WITHDRAWAL'; coinId: string; amount: number; decoy?: boolean }): Promise<{ success: boolean; message: string }> {
  return fetchJson('/wallet/transaction', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAdminUsers(): Promise<{ users: any[] }> {
  return fetchJson('/session/admin/users');
}

export async function getAdminLogs(): Promise<{ sessions: any[] }> {
  return fetchJson('/session/admin/logs');
}
