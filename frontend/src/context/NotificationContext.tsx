import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  type: 'trade' | 'deposit' | 'alert' | 'system';
  timestamp: number;
  read: boolean;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

let nextNotifId = 0;

// Seed some system notifications on startup
const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: ++nextNotifId,
    title: 'ARES Security Active',
    body: 'Adaptive risk engine monitoring your portfolio.',
    type: 'system',
    timestamp: Date.now() - 120_000,
    read: false,
  },
  {
    id: ++nextNotifId,
    title: 'Market Update',
    body: 'Bitcoin is trending above its 30-day average.',
    type: 'alert',
    timestamp: Date.now() - 300_000,
    read: false,
  },
];

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(SEED_NOTIFICATIONS);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
      setNotifications((prev) => [
        {
          ...n,
          id: ++nextNotifId,
          timestamp: Date.now(),
          read: false,
        },
        ...prev,
      ]);
    },
    []
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationProvider');
  return ctx;
}
