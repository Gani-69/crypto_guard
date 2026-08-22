import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  ClipboardList,
  ChevronRight,
  ArrowLeft,
  KeyRound,
  RotateCcw,
  AlertCircle,
  Loader2,
  User as UserIcon,
  Fingerprint,
} from 'lucide-react';
import './AdminDashboard.css';

type AdminView = 'verify' | 'list' | 'detail' | 'logs';

interface UserRow {
  id: string;
  email: string;
  phone: string;
  displayName: string | null;
  role: string;
  kycStatus: string;
  createdAt: string;
}

interface SessionRow {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

interface UserDetail extends UserRow {
  updatedAt: string;
  sessions: SessionRow[];
  webAuthnCredentialCount: number;
}

interface LogRow {
  id: string;
  adminUserId: string;
  viewedUserId: string | null;
  action: string;
  timestamp: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<AdminView>('verify');
  const [adminVerified, setAdminVerified] = useState(false);

  // Verify step
  const [otpCode, setOtpCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  // User list
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  // User detail
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Logs
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Guard: not loaded yet
  if (!user) {
    return (
      <div className="admin-page fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    );
  }

  // Guard: non-admin user
  if (user.role !== 'ADMIN') {
    return (
      <div className="admin-page fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div className="admin-verify-box card-glass" style={{ textAlign: 'center', gap: 16 }}>
          <ShieldCheck size={36} style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
          <h2 style={{ fontSize: '1.1rem' }}>Access Denied</h2>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            This page requires an Admin account.<br />
            You are logged in as <strong>{user.email}</strong> (role: <code>{user.role ?? 'USER'}</code>).
          </p>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
            Log in as <strong>admin@cryptoguard.dev</strong> to access the admin panel.
          </p>
          <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ marginTop: 8 }}>← Back to App</button>
        </div>
      </div>
    );
  }

  // Send OTP on mount for the admin re-verify flow
  useEffect(() => {
    if (view === 'verify' && !adminVerified) {
      handleSendOtp();
    }
  }, []);

  const handleSendOtp = async () => {
    setVerifyError(null);
    try {
      const res = await fetch('/api/admin/send-verify-otp', { method: 'POST' });
      if (res.ok) setOtpSent(true);
    } catch (e) {
      // Silently fail — user can retry via the resend button
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError(null);
    setVerifyLoading(true);
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.message || 'Verification failed');
        return;
      }
      setAdminVerified(true);
      setView('list');
      fetchUsers(1);
    } catch (err) {
      setVerifyError('Network error. Please try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const fetchUsers = useCallback(async (p = 1) => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/admin/users?page=${p}&limit=15`);
      if (!res.ok) {
        if (res.status === 403) { setAdminVerified(false); setView('verify'); }
        return;
      }
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
      setPage(p);
    } catch (e) {
      console.error('Failed to fetch users', e);
    } finally {
      setListLoading(false);
    }
  }, []);

  const fetchDetail = async (userId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (!res.ok) {
        if (res.status === 403) { setAdminVerified(false); setView('verify'); }
        return;
      }
      const data = await res.json();
      setUserDetail(data.user);
    } catch (e) {
      console.error('Failed to fetch user detail', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/logs?limit=50');
      if (!res.ok) {
        if (res.status === 403) { setAdminVerified(false); setView('verify'); }
        return;
      }
      const data = await res.json();
      setLogs(data.logs);
    } catch (e) {
      console.error('Failed to fetch logs', e);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  if (!user || user.role !== 'ADMIN') return null;

  const fmt = (iso: string) => new Date(iso).toLocaleString();

  // ── Verify screen ──────────────────────────────────────────────────
  if (view === 'verify') {
    return (
      <div className="admin-page fade-in">
        <div className="admin-verify-box card-glass">
          <div className="admin-verify-box__header">
            <ShieldCheck size={36} className="accent-icon" />
            <h1>Admin Re-Verification</h1>
            <p className="text-muted">
              {otpSent
                ? `A verification code was sent to ${user.email}. Enter it below to access the admin panel.`
                : 'Requesting verification code…'}
            </p>
          </div>

          <form onSubmit={handleVerify} className="admin-verify-box__form">
            <div className="admin-field">
              <label htmlFor="admin-otp-input">Verification Code</label>
              <input
                id="admin-otp-input"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                required
                style={{ letterSpacing: '0.4em', fontSize: '1.4rem', textAlign: 'center' }}
              />
            </div>

            {verifyError && (
              <div className="admin-alert admin-alert--error">
                <AlertCircle size={14} />
                <span>{verifyError}</span>
              </div>
            )}

            <button
              id="admin-verify-submit-btn"
              type="submit"
              className="btn btn-primary admin-verify-box__submit-btn"
              disabled={verifyLoading || otpCode.length !== 6}
            >
              {verifyLoading ? <><Loader2 size={15} className="spin" /> Verifying…</> : <><KeyRound size={15} /> Verify Access</>}
            </button>

            <button
              type="button"
              className="btn-ghost"
              onClick={handleSendOtp}
              style={{ marginTop: 4 }}
            >
              <RotateCcw size={13} /> Resend code
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── User detail screen ─────────────────────────────────────────────
  if (view === 'detail' && selectedUserId) {
    return (
      <div className="admin-page fade-in">
        <div className="admin-panel">
          <header className="admin-panel__header">
            <button className="btn-ghost" onClick={() => { setView('list'); setUserDetail(null); }}>
              <ArrowLeft size={15} /> Back to Users
            </button>
            <h2>User Detail</h2>
          </header>

          {detailLoading ? (
            <div className="admin-loading"><Loader2 size={28} className="spin" /></div>
          ) : userDetail ? (
            <div className="admin-detail">
              <div className="admin-detail__profile card-glass">
                <div className="admin-detail__avatar"><UserIcon size={28} /></div>
                <div>
                  <h3>{userDetail.displayName || userDetail.email}</h3>
                  <p className="text-muted">{userDetail.email}</p>
                  <p className="text-muted" style={{ fontSize: '0.78rem' }}>{userDetail.phone}</p>
                </div>
                <div className="admin-detail__badges">
                  <span className={`admin-badge admin-badge--${userDetail.role.toLowerCase()}`}>{userDetail.role}</span>
                  <span className={`admin-badge admin-badge--${userDetail.kycStatus.toLowerCase()}`}>{userDetail.kycStatus}</span>
                </div>
              </div>

              <div className="admin-detail__meta card-glass">
                <div className="admin-meta-row"><span>User ID</span><code>{userDetail.id}</code></div>
                <div className="admin-meta-row"><span>Registered</span><span>{fmt(userDetail.createdAt)}</span></div>
                <div className="admin-meta-row"><span>Last Updated</span><span>{fmt(userDetail.updatedAt)}</span></div>
                <div className="admin-meta-row">
                  <span><Fingerprint size={13} style={{ display: 'inline', marginRight: 4 }} />Biometric Credentials</span>
                  <span>{userDetail.webAuthnCredentialCount} registered</span>
                </div>
              </div>

              <div className="admin-detail__sessions card-glass">
                <h4>Session History <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>(last 20)</span></h4>
                <div className="admin-sessions-note text-muted" style={{ fontSize: '0.74rem', marginBottom: 8 }}>
                  Note: Session state and ARES data are not shown here by design.
                </div>
                {userDetail.sessions.length === 0 ? (
                  <p className="text-muted">No sessions found.</p>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr><th>Created</th><th>Last Active</th><th>IP</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {userDetail.sessions.map((s) => (
                        <tr key={s.id}>
                          <td>{fmt(s.createdAt)}</td>
                          <td>{fmt(s.lastActivityAt)}</td>
                          <td>{s.ipAddress || '—'}</td>
                          <td>
                            {s.revokedAt
                              ? <span className="admin-badge admin-badge--revoked">Revoked</span>
                              : new Date(s.expiresAt) < new Date()
                                ? <span className="admin-badge admin-badge--expired">Expired</span>
                                : <span className="admin-badge admin-badge--active">Active</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted">Failed to load user.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Logs screen ────────────────────────────────────────────────────
  if (view === 'logs') {
    return (
      <div className="admin-page fade-in">
        <div className="admin-panel">
          <header className="admin-panel__header">
            <button className="btn-ghost" onClick={() => setView('list')}>
              <ArrowLeft size={15} /> Back
            </button>
            <h2>My Access Audit Log</h2>
          </header>

          {logsLoading ? (
            <div className="admin-loading"><Loader2 size={28} className="spin" /></div>
          ) : (
            <div className="card-glass admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Action</th><th>Target User</th><th>Timestamp</th></tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td><code>{l.action}</code></td>
                      <td>{l.viewedUserId ? <code style={{ fontSize: '0.72rem' }}>{l.viewedUserId}</code> : <span className="text-muted">—</span>}</td>
                      <td>{fmt(l.timestamp)}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: '24px' }}>No log entries.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── User list screen (default) ─────────────────────────────────────
  const totalPages = Math.ceil(total / 15);

  return (
    <div className="admin-page fade-in">
      <div className="admin-panel">
        <header className="admin-panel__header">
          <div className="admin-panel__title">
            <ShieldCheck size={22} className="accent-icon" />
            <h2>Admin Dashboard</h2>
          </div>
          <div className="admin-panel__actions">
            <button
              id="admin-logs-btn"
              className="btn btn-ghost-outline"
              onClick={() => { setView('logs'); fetchLogs(); }}
            >
              <ClipboardList size={15} /> Audit Log
            </button>
          </div>
        </header>

        <div className="admin-panel__body">
          <div className="admin-list-header">
            <div className="admin-list-header__info">
              <Users size={16} />
              <span><strong>{total}</strong> users registered</span>
            </div>
          </div>

          {listLoading ? (
            <div className="admin-loading"><Loader2 size={28} className="spin" /></div>
          ) : (
            <div className="card-glass admin-table-wrap">
              <table className="admin-table admin-table--users">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>KYC</th>
                    <th>Registered</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="admin-table__row--clickable"
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setView('detail');
                        fetchDetail(u.id);
                      }}
                    >
                      <td>{u.email}</td>
                      <td>{u.displayName || <span className="text-muted">—</span>}</td>
                      <td>{u.phone || <span className="text-muted">—</span>}</td>
                      <td><span className={`admin-badge admin-badge--${u.role.toLowerCase()}`}>{u.role}</span></td>
                      <td><span className={`admin-badge admin-badge--${u.kycStatus.toLowerCase()}`}>{u.kycStatus}</span></td>
                      <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td><ChevronRight size={14} className="text-muted" /></td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={7} className="text-muted" style={{ textAlign: 'center', padding: '24px' }}>No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="admin-pagination">
              <button className="btn btn-ghost-outline" disabled={page === 1} onClick={() => fetchUsers(page - 1)}>← Prev</button>
              <span className="text-muted">{page} / {totalPages}</span>
              <button className="btn btn-ghost-outline" disabled={page >= totalPages} onClick={() => fetchUsers(page + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
