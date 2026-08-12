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
  Bell,
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

  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    NORMAL: 'Shield Active',
    STEP_UP: 'Step-up Challenge Requested',
    RESTRICTED: 'Session Suspended',
    SHADOW: 'Decoy Active',
  };

  const stateColors: Record<string, string> = {
    NORMAL: 'var(--green-400)',
    STEP_UP: 'var(--amber-400)',
    RESTRICTED: 'var(--red-400)',
    SHADOW: 'var(--purple-400)',
  };

  const stateDotColor = stateColors[sessionState] || 'var(--green-400)';
  const stateLabelText = stateLabels[sessionState] || 'Shield Active';

  return (
    <div className="layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__header">
          <div className="sidebar__logo">
            <div className="sidebar__logo-icon">
              <Shield size={22} />
            </div>
            <div>
              <h1 className="sidebar__title">CryptoGuard</h1>
              <span className="sidebar__subtitle">Adaptive Security</span>
            </div>
          </div>
          <button className="sidebar__close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
              end={item.to === '/'}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__status" title={`Current session security status: ${sessionState}`}>
            <div className="sidebar__status-dot" style={{ background: stateDotColor, boxShadow: `0 0 8px ${stateDotColor}` }} />
            <span>{stateLabelText}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        {/* Header */}
        <header className="header">
          <button className="header__menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>

          <form className="header__search" onSubmit={handleSearch}>
            <Search size={16} className="header__search-icon" />
            <input
              id="global-search"
              type="text"
              placeholder="Search coins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="header__search-input"
            />
          </form>

          <div className="header__actions">
            <button className="header__action-btn" title="Notifications">
              <Bell size={18} />
            </button>
            <div
              className="header__avatar"
              title={`Logged in as ${user?.displayName || user?.email || 'User'}. Click to logout.`}
              onClick={logout}
            >
              <span>{(user?.displayName || user?.email || 'D')[0].toUpperCase()}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="content">
          <Outlet />
        </main>
      </div>
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
