import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, AlertCircle, ArrowRight } from 'lucide-react';
import './Login.css';

export default function Login() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password, displayName || undefined);
        setSuccessMsg('Account registered successfully! You can now log in.');
        setIsRegister(false);
        setPassword('');
      } else {
        // Collect initial dummy signal metadata for login form typing baselines
        const signal = {
          dwellTimeMs: 110,
          flightTimeMs: 170,
          typingSpeedCpm: 230,
          correctionRate: 0.04,
        };
        await login(email, password, signal);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page fade-in">
      <div className="login-box card-glass">
        <div className="login-box__header">
          <div className="login-box__logo">
            <Shield size={32} />
          </div>
          <h1>CryptoGuard</h1>
          <p className="text-muted">Adaptive Biometric Security Platform</p>
        </div>

        <div className="login-box__tabs">
          <button
            type="button"
            className={`login-box__tab-btn ${!isRegister ? 'login-box__tab-btn--active' : ''}`}
            onClick={() => {
              setIsRegister(false);
              setError(null);
              setSuccessMsg(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-box__tab-btn ${isRegister ? 'login-box__tab-btn--active' : ''}`}
            onClick={() => {
              setIsRegister(true);
              setError(null);
              setSuccessMsg(null);
            }}
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
            {loading ? 'Verifying Credentials...' : isRegister ? 'Create Account' : 'Sign In'}
            <ArrowRight size={16} style={{ marginLeft: 4 }} />
          </button>
        </form>

        <div className="login-box__disclaimer">
          <p>
            <strong>Research Project Notice:</strong> Wallets, assets, and ARES biometric scoring are completely simulated using synthetic benchmarks. No real capital risk involved.
          </p>
        </div>
      </div>
    </div>
  );
}
