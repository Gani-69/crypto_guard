import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LineChart,
  Star,
  Wallet,
  ArrowLeftRight,
  Shield,
  ShieldAlert,
  Search,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import './Layout.css';
import { useAuth } from '../context/AuthContext';
import { useKeystrokeBiometrics } from '../hooks/useKeystrokeBiometrics';
import Login from '../pages/Login';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/markets', icon: LineChart, label: 'Markets' },
  { to: '/watchlist', icon: Star, label: 'Watchlist' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/trading', icon: ArrowLeftRight, label: 'Trading' },
  { to: '/security', icon: Shield, label: 'Security' },
];

export default function Layout() {
  const { user, session, loading, logout, refreshSessionState } = useAuth();
  
  // Activate keystroke telemetry monitoring
  useKeystrokeBiometrics();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // Step-Up verification states
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [passcodeLoading, setPasscodeLoading] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/markets?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeError(null);
    setPasscodeLoading(true);

    try {
      const res = await fetch('/api/session/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: passcode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Verification failed');
      }

      setPasscode('');
      await refreshSessionState();
    } catch (err: any) {
      setPasscodeError(err.message || 'Verification failed');
    } finally {
      setPasscodeLoading(false);
    }
  };

  // Auth Guard: Gated Layout Rendering
  if (loading) {
    return (
      <div className="layout flex items-center justify-center" style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div className="skeleton" style={{ width: 64, height: 64, borderRadius: '50%' }} />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const sessionState = session?.state ?? 'NORMAL';

  // Dynamic state status color maps
  const stateLabels: Record<string, string> = {
    NORMAL: 'Secure',
    STEP_UP: 'Verification Required',
    RESTRICTED: 'Suspended',
    SHADOW: 'Decoy Mode Active',
  };

  const stateColors: Record<string, string> = {
    NORMAL: 'var(--green-400)',
    STEP_UP: 'var(--amber-400)',
    RESTRICTED: 'var(--red-400)',
    SHADOW: 'var(--purple-400)',
  };

  const stateDotColor = stateColors[sessionState] || 'var(--green-400)';
  const stateLabelText = stateLabels[sessionState] || 'Secure';

  return (
    <div className="layout-horizontal">
      {/* ── Top Header Navigation Bar ── */}
      <header className="navbar">
        <div className="navbar__container">
          {/* Logo */}
          <div className="navbar__brand">
            <div className="navbar__logo-icon">
              <Shield size={20} />
            </div>
            <div>
              <span className="navbar__title">CryptoGuard</span>
              <span className="navbar__badge">DCX PRO</span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="navbar__nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `navbar__link ${isActive ? 'navbar__link--active' : ''}`
                }
                end={item.to === '/'}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Search bar */}
          <form className="navbar__search" onSubmit={handleSearch}>
            <Search size={14} className="navbar__search-icon" />
            <input
              id="global-search"
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="navbar__search-input"
            />
          </form>

          {/* Security & User Actions */}
          <div className="navbar__actions">
            {/* Security Indicator */}
            <div className="navbar__status" title={`Security status: ${sessionState}`}>
              <div className="navbar__status-dot" style={{ background: stateDotColor, boxShadow: `0 0 8px ${stateDotColor}` }} />
              <span style={{ color: stateDotColor }}>{stateLabelText}</span>
            </div>

            {/* Telemetry pulse */}
            <div className="navbar__telemetry" title="ARES Biometric Telemetry Live">
              <div className="telemetry-pulse-dot" />
              <span>LIVE</span>
            </div>

            {/* Logout button */}
            <button className="navbar__logout-btn" onClick={logout} title="Log out safely">
              <LogOut size={16} />
            </button>
            
            {/* Avatar */}
            <div className="navbar__avatar" title={`Logged in as ${user?.displayName || user?.email}`}>
              <span>{(user?.displayName || user?.email || 'U')[0].toUpperCase()}</span>
            </div>

            {/* Mobile Hamburger menu icon */}
            <button className="navbar__hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Links Panel */}
        {mobileMenuOpen && (
          <div className="navbar__mobile-menu">
            <div className="navbar__mobile-links">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `navbar__mobile-link ${isActive ? 'navbar__mobile-link--active' : ''}`
                  }
                  onClick={() => setMobileMenuOpen(false)}
                  end={item.to === '/'}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <button className="navbar__mobile-logout" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── Main Content Area ── */}
      <main className="navbar__content">
        <Outlet />
      </main>

      {/* Step Up Verification Modal */}
      {(sessionState === 'STEP_UP' || sessionState === 'RESTRICTED') && (
        <div className="security-modal-overlay">
          <div className="security-modal-card card-glass fade-in">
            <div className="security-modal-icon flex justify-center items-center">
              <ShieldAlert size={32} />
            </div>
            <h2>Verification Challenge Required</h2>
            <p className="text-secondary text-center" style={{ fontSize: '0.82rem', lineHeight: 1.4, margin: '8px 0 16px' }}>
              ARES detected atypical behavioral patterns during this session. To restore access, please verify your identity with your security passcode.
            </p>
            <form onSubmit={handlePasscodeSubmit} className="security-modal-form flex flex-col gap-md">
              <input
                id="challenge-passcode"
                type="password"
                placeholder="Enter your security passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                autoComplete="off"
                required
              />
              {passcodeError && (
                <div className="security-modal-error">
                  <span>{passcodeError}</span>
                </div>
              )}
              <div className="flex gap-sm justify-center">
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={passcodeLoading}
                >
                  {passcodeLoading ? 'Verifying...' : 'Verify Identity'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={logout}
                  title="Logout current session safely"
                >
                  Logout
                </button>
              </div>
              <p className="text-muted text-center" style={{ fontSize: '0.68rem', marginTop: '4px', opacity: 0.6 }}>
                Demo environment — check the Security dashboard for simulation controls
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
