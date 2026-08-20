/* ── Data fetching hooks ─────────────────────────────────────────────
   Simple useState+useEffect pattern. No external state library needed
   for this sprint's scope.
   ──────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/client';
import type { CoinDetail, MarketStats, WatchlistCoin, WalletData, Order, Transaction } from '../types';

// ── Generic fetch hook ──
function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

// ── Coins list ──
export function useCoins(params?: {
  search?: string;
  trending?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
}) {
  const { data, loading, error, refetch } = useFetch(
    () => api.getCoins(params),
    [params?.search, params?.trending, params?.sort, params?.order]
  );
  return { coins: data?.coins ?? [], count: data?.count ?? 0, loading, error, refetch };
}

// ── Single coin ──
export function useCoin(idOrSymbol: string) {
  const { data, loading, error, refetch } = useFetch<CoinDetail>(
    () => api.getCoin(idOrSymbol),
    [idOrSymbol]
  );
  return { coin: data, loading, error, refetch };
}

// ── Market stats ──
export function useMarketStats() {
  const { data, loading, error } = useFetch<MarketStats>(
    () => api.getMarketStats(),
    []
  );
  return { stats: data, loading, error };
}

// ── Watchlist ──
export function useWatchlist() {
  const { data, loading, error, refetch } = useFetch(
    () => api.getWatchlist(),
    []
  );
  return { watchlist: data?.watchlist ?? [] as WatchlistCoin[], loading, error, refetch };
}

// ── Debounced search ──
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Wallet Data ──
export function useWallet(decoy?: boolean) {
  const { data, loading, error, refetch } = useFetch<WalletData>(
    () => api.getWallet(decoy),
    [decoy]
  );
  return { walletData: data, loading, error, refetch };
}

// ── Transactions ──
export function useTransactions(limit?: number, decoy?: boolean) {
  const { data, loading, error, refetch } = useFetch(
    () => api.getTransactions(limit, decoy),
    [limit, decoy]
  );
  return { transactions: data?.transactions ?? [] as Transaction[], loading, error, refetch };
}

// ── Orders ──
export function useOrders(params?: { limit?: number; status?: string; decoy?: boolean }) {
  const { data, loading, error, refetch } = useFetch(
    () => api.getOrders(params),
    [params?.limit, params?.status, params?.decoy]
  );
  return { orders: data?.orders ?? [] as Order[], loading, error, refetch };
}
