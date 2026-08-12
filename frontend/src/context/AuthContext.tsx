import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  displayName: string | null;
}

interface Session {
  id: string;
  state: string;
  expiresAt: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string, signal?: any) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSessionState: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup auth header on fetch calls
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const jwtToken = localStorage.getItem('token');
      if (jwtToken && typeof input === 'string' && input.startsWith('/api')) {
        init = init || {};
        init.headers = {
          ...init.headers,
          Authorization: `Bearer ${jwtToken}`,
        };
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Fetch session data on load
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    fetch('/api/session/me')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Session invalid');
        }
        const data = await res.json();
        setUser(data.user);
        setSession(data.session);
      })
      .catch(() => {
        // Clear expired/invalid session
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const login = async (email: string, password: string, signal?: any) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, signal }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Login failed');
    }

    const data = await res.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    setSession(data.session);
  };

  const register = async (email: string, password: string, displayName?: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Registration failed');
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore network errors
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      setSession(null);
    }
  };

  const refreshSessionState = async (): Promise<string> => {
    try {
      const res = await fetch('/api/session/me');
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        return data.session.state;
      }
    } catch (e) {
      console.error("Failed to refresh session state:", e);
    }
    return session?.state ?? 'NORMAL';
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        session,
        loading,
        login,
        register,
        logout,
        refreshSessionState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
