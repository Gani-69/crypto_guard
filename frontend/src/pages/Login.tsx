import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertCircle, ArrowRight, Fingerprint, KeyRound, RotateCcw, Loader2 } from 'lucide-react';
import './Login.css';

type LoginStep = 'credentials' | 'otp';

export default function Login() {
  const { login, verifyOtp, resendOtp, register, loginWithWebAuthn } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);

  // Credentials step
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(''); // F1
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // F2: OTP step
  const [step, setStep] = useState<LoginStep>('credentials');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // Duress detection (existing: long-press on logo or biometric button)
  const [isDuress, setIsDuress] = useState(false);
  const duressRef = useRef<any>(null);
  const DURESS_HOLD_MS = 2000;

  const handlePointerDown = () => {
    duressRef.current = setTimeout(() => {
      setIsDuress(true);
      console.log('[ARES] Discreet manual duress gesture activated.');
    }, DURESS_HOLD_MS);
  };

  const handlePointerUp = () => {
    if (duressRef.current) {
      clearTimeout(duressRef.current);
      duressRef.current = null;
    }
  };

  // ── Phase 1: submit credentials ────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password, phone, displayName || undefined);
        setSuccessMsg('Account registered successfully! You can now log in.');
        setIsRegister(false);
        setPassword('');
        setPhone('');
      } else {
        const signal = {
          dwellTimeMs: 110,
          flightTimeMs: 170,
          typingSpeedCpm: 230,
          correctionRate: 0.04,
          manualDuressSignal: isDuress,
        };
        const result = await login(email, password, signal);
        setPendingSessionId(result.pendingSessionId);
        setStep('otp');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Phase 2: submit OTP ────────────────────────────────────────────
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSessionId) return;
    setError(null);
    setOtpLoading(true);

    try {
      await verifyOtp(pendingSessionId, otpCode);
      // verifyOtp sets auth state. Navigate explicitly — Layout's user guard
      // will show the app, but we navigate to ensure the router updates.
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Verification failed');
      setOtpCode('');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingSessionId) return;
    setResendMsg(null);
    setResendLoading(true);
    try {
      await resendOtp(pendingSessionId);
      setResendMsg('A new code has been sent to your email.');
    } catch (err: any) {
      setResendMsg(err.message || 'Failed to resend.');
    } finally {
      setResendLoading(false);
    }
  };

  // ── F5: biometric login ────────────────────────────────────────────
  // The biometric button gets the same duress gesture as the logo.
  // A 2s hold before the platform prompt fires sets manualDuressSignal=true.
  const handleBiometric = async () => {
    if (!email) {
      setError('Enter your email address first, then use biometric sign-in.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithWebAuthn(email, isDuress);
      setPendingSessionId(result.pendingSessionId);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Biometric authentication failed.');
    } finally {
      setLoading(false);
      setIsDuress(false);
    }
  };

  const resetToCredentials = () => {
    setStep('credentials');
    setPendingSessionId(null);
    setOtpCode('');
    setError(null);
    setResendMsg(null);
    setIsDuress(false);
  };

  // ── OTP screen ─────────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <div className="login-page fade-in">
        <div className="login-box card-glass">
          <div className="login-box__header">
            <div className="login-box__logo">
              <KeyRound size={32} />
            </div>
            <h1>Verify Your Identity</h1>
            <p className="text-muted">A 6-digit code was sent to your registered mobile SMS & email</p>
          </div>

          <form onSubmit={handleOtpSubmit} className="login-box__form">
            <div className="login-box__field">
              <label htmlFor="otp-input">One-Time Code</label>
              <input
                id="otp-input"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                required
                style={{ letterSpacing: '0.4em', fontSize: '1.5rem', textAlign: 'center' }}
              />
            </div>

            {error && (
              <div className="login-box__alert login-box__alert--error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {resendMsg && (
              <div className="login-box__alert login-box__alert--success">
                <AlertCircle size={16} />
                <span>{resendMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary login-box__submit-btn"
              disabled={otpLoading || otpCode.length !== 6}
            >
              {otpLoading ? <><Loader2 size={16} className="spin" /> Verifying…</> : <>Verify Code <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="login-box__otp-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleResend}
              disabled={resendLoading}
            >
              {resendLoading ? 'Resending…' : 'Resend code'}
            </button>
            <button type="button" className="btn-ghost" onClick={resetToCredentials}>
              <RotateCcw size={13} /> Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Credentials screen ─────────────────────────────────────────────
  return (
    <div className="login-page fade-in">
      <div className="login-box card-glass">
        <div className="login-box__header">
          <div
            className="login-box__logo"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <Shield size={32} />
          </div>
          <h1>CryptoGuard</h1>
          <p className="text-muted">Adaptive Biometric Security Platform</p>
        </div>

        <div className="login-box__tabs">
          <button
            type="button"
            className={`login-box__tab-btn ${!isRegister ? 'login-box__tab-btn--active' : ''}`}
            onClick={() => { setIsRegister(false); setError(null); setSuccessMsg(null); setIsDuress(false); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-box__tab-btn ${isRegister ? 'login-box__tab-btn--active' : ''}`}
            onClick={() => { setIsRegister(true); setError(null); setSuccessMsg(null); setIsDuress(false); }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-box__form">
          {isRegister && (
            <div className="login-box__field">
              <label htmlFor="display-name-input">Display Name</label>
              <input
                id="display-name-input"
                type="text"
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div className="login-box__field">
            <label htmlFor="email-input">Email Address</label>
            <input
              id="email-input"
              type="email"
              placeholder="demo@cryptoguard.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* F1: phone field — register mode only */}
          {isRegister && (
            <div className="login-box__field">
              <label htmlFor="phone-input">Phone Number</label>
              <input
                id="phone-input"
                type="tel"
                placeholder="+1 555 000 0001"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          )}

          <div className="login-box__field">
            <label htmlFor="password-input">Password</label>
            <input
              id="password-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="login-box__alert login-box__alert--error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="login-box__alert login-box__alert--success">
              <AlertCircle size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary login-box__submit-btn"
            disabled={loading}
          >
            {loading
              ? 'Verifying Credentials…'
              : isRegister
                ? 'Create Account'
                : 'Sign In'}
            <ArrowRight size={16} style={{ marginLeft: 4 }} />
          </button>
        </form>

        {/* F5: Biometric sign-in — shown only when browser supports WebAuthn */}
        {!isRegister && typeof window !== 'undefined' && 'PublicKeyCredential' in window && (
          <div className="login-box__biometric">
            <div className="login-box__divider"><span>or</span></div>
            <button
              type="button"
              id="biometric-signin-btn"
              className="btn btn-ghost login-box__biometric-btn"
              disabled={loading}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onClick={handleBiometric}
              title="Hold 2 seconds before clicking for duress signal"
            >
              <Fingerprint size={18} />
              Sign in with biometrics
            </button>
            {isDuress && (
              <p className="login-box__duress-hint text-muted" style={{ fontSize: '0.72rem', textAlign: 'center', marginTop: 4 }}>
                🔴 Duress signal active
              </p>
            )}
          </div>
        )}

        <div className="login-box__disclaimer">
          <p>
            <strong>Research Project Notice:</strong> Wallets, assets, and ARES biometric scoring are completely simulated using synthetic benchmarks. No real capital risk involved.
          </p>
        </div>
      </div>
    </div>
  );
}
