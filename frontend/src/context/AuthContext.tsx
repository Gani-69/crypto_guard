import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  displayName: string | null;
  kycStatus?: 'PENDING' | 'VERIFIED' | string;
  role?: 'USER' | 'ADMIN' | string;
}

interface Session {
  id: string;
  state: string;
  expiresAt: string;
}

export interface KycPayload {
  fullName?: string;
  panNumber: string;
  aadhaarLast4: string;
  paymentMethod: 'UPI' | 'BANK';
  upiId?: string;
  bankAccount?: string;
  ifsc?: string;
}

// F2: intermediate state returned after phase 1 of login
export interface PendingLogin {
  pendingSessionId: string;
  message: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  session: Session | null;
  loading: boolean;
  // F1: phone added to register()
  login: (email: string, password: string, signal?: any) => Promise<PendingLogin>;
  verifyOtp: (pendingSessionId: string, code: string) => Promise<void>;
  resendOtp: (pendingSessionId: string) => Promise<void>;
  register: (email: string, password: string, phone: string, displayName?: string) => Promise<void>;
  // F5: biometric login
  loginWithWebAuthn: (email: string, manualDuressSignal?: boolean) => Promise<PendingLogin>;
  submitKyc: (kycData: KycPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshSessionState: () => Promise<string>;
  isUnlocked: boolean;
  setIsUnlocked: (unlocked: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Clear unlock state on logout
  useEffect(() => {
    if (!token) {
      setIsUnlocked(false);
    }
  }, [token]);

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
        if (!res.ok) throw new Error('Session invalid');
        const data = await res.json();
        setUser(data.user);
        setSession(data.session);
      })
      .catch(() => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  // ── F2: Phase 1 login — returns pendingSessionId, no token yet ────────
  const login = async (email: string, password: string, signal?: any): Promise<PendingLogin> => {
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
    // Phase 1 returns { pendingSessionId, message } — no token
    return { pendingSessionId: data.pendingSessionId, message: data.message };
  };

  // ── F2: Phase 2 OTP verification — issues token on success ───────────
  const verifyOtp = async (pendingSessionId: string, code: string): Promise<void> => {
    const res = await fetch('/api/auth/login/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingSessionId, code }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // Propagate attemptsRemaining if present
      const msg = err.message || (err.error === 'otp_locked'
        ? 'Too many failed attempts. Please log in again.'
        : err.attemptsRemaining != null
          ? `Incorrect code. ${err.attemptsRemaining} attempt${err.attemptsRemaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect code.');
      throw new Error(msg);
    }

    const data = await res.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    setSession(data.session);
  };

  // ── F2: Resend OTP ────────────────────────────────────────────────────
  const resendOtp = async (pendingSessionId: string): Promise<void> => {
    const res = await fetch('/api/auth/login/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingSessionId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to resend OTP');
    }
  };

  // ── F1: register — phone is now required ─────────────────────────────
  const register = async (email: string, password: string, phone: string, displayName?: string): Promise<void> => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, phone, displayName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Registration failed');
    }
  };

  // ── F5: WebAuthn biometric login ──────────────────────────────────────
  const loginWithWebAuthn = async (email: string, manualDuressSignal?: boolean): Promise<PendingLogin> => {
    // begin: get authentication options
    const beginRes = await fetch('/api/webauthn/authenticate/begin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!beginRes.ok) {
      const err = await beginRes.json().catch(() => ({}));
      throw new Error(err.message || 'No biometric credentials found for this account.');
    }

    const { userId, options } = await beginRes.json();

    // Use @simplewebauthn/browser to trigger the platform authenticator
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const authResponse = await startAuthentication({ optionsJSON: options });

    // complete: verify assertion on server, get pendingSessionId
    const completeRes = await fetch('/api/webauthn/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, response: authResponse, manualDuressSignal: Boolean(manualDuressSignal) }),
    });

    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({}));
      throw new Error(err.message || 'Biometric authentication failed.');
    }

    const data = await completeRes.json();
    return { pendingSessionId: data.pendingSessionId, message: data.message };
  };

  const submitKyc = async (kycData: KycPayload): Promise<void> => {
    const res = await fetch('/api/wallet/kyc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kycData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'KYC verification failed');
    }

    const data = await res.json();
    if (data.user) {
      setUser((prev) => ({
        ...(prev ?? {}),
        ...data.user,
      }));
    }
  };

  const logout = async (): Promise<void> => {
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
      console.error('Failed to refresh session state:', e);
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
        verifyOtp,
        resendOtp,
        register,
        loginWithWebAuthn,
        submitKyc,
        logout,
        refreshSessionState,
        isUnlocked,
        setIsUnlocked,
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
