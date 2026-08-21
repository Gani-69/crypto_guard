import { useState, useEffect, useRef, useCallback } from 'react';

interface PriceTick {
  symbol: string;
  price: number;
}

interface WebSocketMessage {
  type: 'hello' | 'price_tick' | 'heartbeat' | 'echo';
  prices?: PriceTick[];
}

interface UseWebSocketReturn {
  /** Live price map: symbol -> latest price override */
  livePrices: Record<string, number>;
  /** Whether the WebSocket is currently connected */
  connected: boolean;
}

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

/** Exponential backoff reconnect delays (ms) */
const BACKOFF = [1000, 2000, 4000, 8000, 16000];

export function useWebSocket(): UseWebSocketReturn {
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return; }
        setConnected(true);
        retryRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WebSocketMessage = JSON.parse(event.data);
          if (msg.type === 'price_tick' && msg.prices) {
            setLivePrices((prev) => {
              const next = { ...prev };
              msg.prices!.forEach(({ symbol, price }) => {
                next[symbol] = price;
              });
              return next;
            });
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnected(false);
        wsRef.current = null;

        // Exponential backoff reconnect
        const delay = BACKOFF[Math.min(retryRef.current, BACKOFF.length - 1)];
        retryRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose fires after onerror, so reconnect is handled there
        ws.close();
      };
    } catch {
      // Fallback: retry after delay
      const delay = BACKOFF[Math.min(retryRef.current, BACKOFF.length - 1)];
      retryRef.current += 1;
      retryTimerRef.current = setTimeout(connect, delay);
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { livePrices, connected };
}
