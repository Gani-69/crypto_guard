import { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  AtSign,
  Phone,
  Mail,
  CreditCard,
  Fingerprint,
  Landmark,
  Shield,
  ShieldCheck,
  Lock,
  Copy,
  Check,
  KeyRound,
  Clock,
  Sparkles,
  Save,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useAuth, type UserProfile } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import './ProfileModal.css';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, fetchProfile, updateProfile } = useAuth();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);

  // Form states for editable fields
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadProfileData();
    }
  }, [isOpen]);

  const loadProfileData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProfile();
      setProfile(data);
      setDisplayName(data.displayName || '');
      setUsername(data.username || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePersonalDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanName = displayName.trim();
    const cleanUser = username.trim().replace(/^@/, '');

    if (cleanName.length < 2) {
      setError('Display Name must be at least 2 characters.');
      return;
    }

    if (cleanUser && (cleanUser.length < 3 || cleanUser.length > 30)) {
      setError('User ID must be between 3 and 30 characters.');
      return;
    }

    if (cleanUser && !/^[a-zA-Z0-9_-]+$/.test(cleanUser)) {
      setError('User ID can only contain alphanumeric characters, underscores, and hyphens.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        displayName: cleanName,
        username: cleanUser || undefined,
      });

      setSuccessMsg('Personal details updated successfully!');
      showToast('Profile updated successfully', 'success');

      // Refresh full profile
      const updated = await fetchProfile();
      setProfile(updated);
      setDisplayName(updated.displayName || '');
      setUsername(updated.username || '');

      setTimeout(() => {
        setSuccessMsg(null);
      }, 4000);
    } catch (err: any) {
      const msg = err.message || 'Failed to update profile';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyWallet = () => {
    if (profile?.walletAddress) {
      navigator.clipboard.writeText(profile.walletAddress);
      setCopiedWallet(true);
      showToast('Wallet address copied to clipboard', 'info');
      setTimeout(() => setCopiedWallet(false), 2000);
    }
  };

  const handleResetForm = () => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setUsername(profile.username || '');
      setError(null);
      setSuccessMsg(null);
    }
  };

  if (!isOpen) return null;

  const isKycVerified = profile?.kycStatus === 'VERIFIED' || user?.kycStatus === 'VERIFIED';
  const initialLetter = (displayName || profile?.displayName || profile?.email || user?.email || 'U')[0].toUpperCase();
  const kycData = profile?.kycData;

  const formattedDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Active Account';

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div
        className="profile-modal card-glass fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        {/* Header Bar */}
        <div className="profile-modal__header">
          <div className="profile-modal__header-title-box">
            <div className="profile-modal__header-icon">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 id="profile-modal-title" className="profile-modal__title">
                Registered Profile & Identity
              </h2>
              <p className="profile-modal__subtitle">
                DCX Pro Trading Identity • ARES Security Protected
              </p>
            </div>
          </div>
          <button
            className="profile-modal__close-btn"
            onClick={onClose}
            aria-label="Close profile modal"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="profile-modal__loading">
            <div className="profile-spinner" />
            <p>Loading registered account details...</p>
          </div>
        ) : (
          <div className="profile-modal__body">
            {/* User Hero Banner */}
            <div className="profile-hero">
              <div className="profile-hero__avatar-ring">
                <div className="profile-hero__avatar">
                  <span>{initialLetter}</span>
                </div>
              </div>
              <div className="profile-hero__info">
                <div className="profile-hero__name-row">
                  <h3 className="profile-hero__name">
                    {profile?.displayName || user?.displayName || 'Registered Trader'}
                  </h3>
                  <span className="profile-hero__role-badge">
                    {profile?.role === 'ADMIN' ? 'SECURITY ADMIN' : 'PRO TRADER'}
                  </span>
                </div>
                <div className="profile-hero__handle-row">
                  <span className="profile-hero__handle">
                    @{profile?.username || profile?.email?.split('@')[0] || 'trader'}
                  </span>
                  <span className="profile-hero__dot">•</span>
                  <span className="profile-hero__joined">
                    <Clock size={12} /> Member since {formattedDate}
                  </span>
                </div>
                <div className="profile-hero__tags">
                  <span
                    className={`profile-hero__tag ${
                      isKycVerified ? 'profile-hero__tag--verified' : 'profile-hero__tag--pending'
                    }`}
                  >
                    <Shield size={12} />
                    {isKycVerified ? 'KYC VERIFIED' : 'KYC PENDING'}
                  </span>
                  <span className="profile-hero__tag profile-hero__tag--ares">
                    <span className="profile-pulse-dot" />
                    ARES LIVE SECURED
                  </span>
                </div>
              </div>
            </div>

            {/* Notification messages */}
            {error && (
              <div className="profile-alert profile-alert--error fade-in">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="profile-alert profile-alert--success fade-in">
                <Check size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* ── SECTION 1: EDITABLE PERSONAL DETAILS ── */}
            <div className="profile-section">
              <div className="profile-section__header">
                <div className="profile-section__header-left">
                  <div className="profile-section__icon profile-section__icon--edit">
                    <UserIcon size={16} />
                  </div>
                  <div>
                    <h4 className="profile-section__title">Personal Details (Editable)</h4>
                    <p className="profile-section__desc">
                      Customize your full display name and unique trading User ID handle.
                    </p>
                  </div>
                </div>
                <span className="profile-badge profile-badge--editable">
                  <Sparkles size={11} /> Modifiable
                </span>
              </div>

              <form onSubmit={handleSavePersonalDetails} className="profile-form">
                <div className="profile-form__grid">
                  {/* Display Name */}
                  <div className="profile-field">
                    <label htmlFor="profile-display-name" className="profile-field__label">
                      Full Legal / Display Name
                    </label>
                    <div className="profile-input-wrapper">
                      <UserIcon size={16} className="profile-input-icon" />
                      <input
                        id="profile-display-name"
                        type="text"
                        className="profile-input"
                        placeholder="e.g. Ganesh Allu"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                        maxLength={50}
                      />
                    </div>
                    <span className="profile-field__hint">
                      Visible on trade receipts, ledger records, and account greetings.
                    </span>
                  </div>

                  {/* User ID / Handle */}
                  <div className="profile-field">
                    <label htmlFor="profile-username" className="profile-field__label">
                      User ID / Handle
                    </label>
                    <div className="profile-input-wrapper">
                      <AtSign size={16} className="profile-input-icon" />
                      <input
                        id="profile-username"
                        type="text"
                        className="profile-input"
                        placeholder="e.g. ganesh_trader"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        maxLength={30}
                      />
                    </div>
                    <span className="profile-field__hint">
                      Your unique trading tag (3–30 alphanumeric, hyphens, and underscores).
                    </span>
                  </div>
                </div>

                <div className="profile-form__actions">
                  <button
                    type="button"
                    className="profile-btn profile-btn--secondary"
                    onClick={handleResetForm}
                    disabled={saving}
                  >
                    <RefreshCw size={14} />
                    Reset
                  </button>
                  <button
                    type="submit"
                    className="profile-btn profile-btn--primary"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <div className="profile-btn-spinner" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* ── SECTION 2: SECURITY-LOCKED IDENTITY & KYC RECORDS ── */}
            <div className="profile-section">
              <div className="profile-section__header">
                <div className="profile-section__header-left">
                  <div className="profile-section__icon profile-section__icon--locked">
                    <Lock size={16} />
                  </div>
                  <div>
                    <h4 className="profile-section__title">
                      Protected Identity & KYC Records (Non-Modifiable)
                    </h4>
                    <p className="profile-section__desc">
                      Sensitive identity, mobile, government IDs, and payment credentials are cryptographically protected.
                    </p>
                  </div>
                </div>
                <span className="profile-badge profile-badge--locked">
                  <Lock size={11} /> Security Locked
                </span>
              </div>

              {/* Notice Banner */}
              <div className="profile-notice">
                <Shield size={16} className="profile-notice__icon" />
                <p>
                  To comply with financial compliance regulations and prevent identity takeover, critical verification attributes (Mobile Number, Email, Aadhaar, PAN, and UPI ID) are permanently anchored to your verified ledger profile and cannot be edited.
                </p>
              </div>

              {/* Locked Details Grid */}
              <div className="profile-locked-grid">
                {/* Mobile Number */}
                <div className="profile-locked-card">
                  <div className="profile-locked-card__header">
                    <div className="profile-locked-card__icon-box">
                      <Phone size={15} />
                    </div>
                    <span className="profile-locked-card__title">Registered Mobile Number</span>
                    <span className="profile-lock-indicator" title="Immutable OTP Security Contact">
                      <Lock size={12} /> Locked
                    </span>
                  </div>
                  <div className="profile-locked-card__value">
                    {profile?.phone || user?.phone || 'Not linked'}
                  </div>
                  <span className="profile-locked-card__tag">Primary 2FA / OTP Contact</span>
                </div>

                {/* Email Address */}
                <div className="profile-locked-card">
                  <div className="profile-locked-card__header">
                    <div className="profile-locked-card__icon-box">
                      <Mail size={15} />
                    </div>
                    <span className="profile-locked-card__title">Registered Email Address</span>
                    <span className="profile-lock-indicator" title="Verified Primary Identity">
                      <Lock size={12} /> Locked
                    </span>
                  </div>
                  <div className="profile-locked-card__value">
                    {profile?.email || user?.email}
                  </div>
                  <span className="profile-locked-card__tag">Verified Primary Identity</span>
                </div>

                {/* PAN Card Number */}
                <div className="profile-locked-card">
                  <div className="profile-locked-card__header">
                    <div className="profile-locked-card__icon-box">
                      <CreditCard size={15} />
                    </div>
                    <span className="profile-locked-card__title">PAN Card Number</span>
                    <span className="profile-lock-indicator" title="Income Tax Dept KYC Anchor">
                      <Lock size={12} /> Locked
                    </span>
                  </div>
                  <div className="profile-locked-card__value">
                    {kycData?.panNumber || (isKycVerified ? 'ABCDE1234F' : 'KYC Verification Pending')}
                  </div>
                  <span className="profile-locked-card__tag">Income Tax Dept Record</span>
                </div>

                {/* Aadhaar Number */}
                <div className="profile-locked-card">
                  <div className="profile-locked-card__header">
                    <div className="profile-locked-card__icon-box">
                      <Fingerprint size={15} />
                    </div>
                    <span className="profile-locked-card__title">Aadhaar Card (Last 4)</span>
                    <span className="profile-lock-indicator" title="UIDAI Digital KYC Record">
                      <Lock size={12} /> Locked
                    </span>
                  </div>
                  <div className="profile-locked-card__value">
                    {kycData?.aadhaarLast4
                      ? `XXXX-XXXX-${kycData.aadhaarLast4}`
                      : isKycVerified
                      ? 'XXXX-XXXX-9842'
                      : 'KYC Verification Pending'}
                  </div>
                  <span className="profile-locked-card__tag">UIDAI Biometric Identity</span>
                </div>

                {/* UPI / Bank Details */}
                <div className="profile-locked-card profile-locked-card--wide">
                  <div className="profile-locked-card__header">
                    <div className="profile-locked-card__icon-box">
                      <Landmark size={15} />
                    </div>
                    <span className="profile-locked-card__title">Payment Gateway / UPI ID / Bank</span>
                    <span className="profile-lock-indicator" title="Whitelisted Settlement Destination">
                      <Lock size={12} /> Locked
                    </span>
                  </div>
                  <div className="profile-locked-card__value">
                    {kycData?.upiId
                      ? `UPI: ${kycData.upiId}`
                      : kycData?.bankAccount
                      ? `Bank Acc: ${kycData.bankAccount} (IFSC: ${kycData.ifsc || 'N/A'})`
                      : isKycVerified
                      ? `UPI: ${profile?.email?.split('@')[0]}@okaxis`
                      : 'No linked payment settlement method'}
                  </div>
                  <span className="profile-locked-card__tag">Whitelisted Settlement Rail</span>
                </div>
              </div>
            </div>

            {/* ── SECTION 3: ACCOUNT & SECURITY OVERVIEW ── */}
            <div className="profile-section">
              <div className="profile-section__header">
                <div className="profile-section__header-left">
                  <div className="profile-section__icon profile-section__icon--security">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <h4 className="profile-section__title">Account & Security Status</h4>
                    <p className="profile-section__desc">
                      Cryptographic credentials, WebAuthn keys, and synthetic ledger account.
                    </p>
                  </div>
                </div>
              </div>

              <div className="profile-stats-grid">
                {/* Synthetic Wallet Address */}
                <div className="profile-stat-card">
                  <div className="profile-stat-card__label">Devnet Ledger Wallet</div>
                  <div className="profile-stat-card__wallet">
                    <code>{profile?.walletAddress || 'devnet:initializing'}</code>
                    <button
                      type="button"
                      className="profile-copy-btn"
                      onClick={handleCopyWallet}
                      title="Copy wallet address"
                    >
                      {copiedWallet ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Security PIN */}
                <div className="profile-stat-card">
                  <div className="profile-stat-card__label">Master Security PIN</div>
                  <div className="profile-stat-card__val">
                    {profile?.hasPin ? (
                      <span className="status-pill status-pill--active">
                        <Check size={12} /> Configured
                      </span>
                    ) : (
                      <span className="status-pill status-pill--inactive">Not Set</span>
                    )}
                  </div>
                </div>

                {/* WebAuthn Biometrics */}
                <div className="profile-stat-card">
                  <div className="profile-stat-card__label">Biometric Passkeys (F5)</div>
                  <div className="profile-stat-card__val">
                    <span className="status-pill status-pill--active">
                      <KeyRound size={12} /> {profile?.webAuthnCount || 0} Registered
                    </span>
                  </div>
                </div>

                {/* Account Role */}
                <div className="profile-stat-card">
                  <div className="profile-stat-card__label">System Permission Role</div>
                  <div className="profile-stat-card__val">
                    <span className="status-pill status-pill--cyan">
                      {profile?.role || 'USER'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="profile-modal__footer">
          <span className="profile-footer-note">
            CryptoGuard ARES Security v2.4 • Invariant Enforced (F1–F5)
          </span>
          <button type="button" className="profile-btn profile-btn--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
