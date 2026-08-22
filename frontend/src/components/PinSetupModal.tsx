/* ── PinSetupModal (F3) ───────────────────────────────────────────────
   Collects normalPin and masterPin, validates them, and calls
   POST /api/pin/setup. Called from Wallet.tsx when pinsConfigured=false.

   Invariant: normalPin and masterPin must differ. The server enforces this
   too, but we validate client-side for immediate feedback.
   ────────────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import { KeyRound, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PinSetupModal({ onSuccess, onCancel }: Props) {
  const [normalPin, setNormalPin] = useState('');
  const [masterPin, setMasterPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (normalPin.length < 4 || masterPin.length < 4) {
      setError('Both PINs must be at least 4 digits.');
      return;
    }
    if (!/^\d+$/.test(normalPin) || !/^\d+$/.test(masterPin)) {
      setError('PINs must contain only digits.');
      return;
    }
    if (normalPin === masterPin) {
      setError('Normal PIN and Master PIN must be different.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/pin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ normalPin, masterPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'PIN setup failed.');
        return;
      }
      setDone(true);
      setTimeout(() => onSuccess(), 1200);
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="security-modal-overlay">
      <div className="security-modal-card card-glass fade-in" style={{ maxWidth: 380 }}>
        <button
          style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          onClick={onCancel}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="security-modal-icon flex justify-center items-center">
          <KeyRound size={28} />
        </div>

        <h2>Set Up Wallet PINs</h2>

        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--green-400)' }}>
            <CheckCircle2 size={32} style={{ marginBottom: 8 }} />
            <p>PINs configured!</p>
          </div>
        ) : (
          <>
            <p className="text-secondary text-center" style={{ fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 16 }}>
              <strong>Normal PIN</strong> — shown to anyone demanding access under duress (returns decoy balance).<br />
              <strong>Master PIN</strong> — unlocks your authentic wallet. Keep this secret.
            </p>

            <form onSubmit={handleSubmit} className="security-modal-form flex flex-col gap-md">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Normal PIN (4–8 digits)</label>
                <input
                  id="normal-pin-input"
                  type="password"
                  inputMode="numeric"
                  minLength={4}
                  maxLength={8}
                  placeholder="Shown under duress"
                  value={normalPin}
                  onChange={(e) => setNormalPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Master PIN (4–8 digits)</label>
                <input
                  id="master-pin-input"
                  type="password"
                  inputMode="numeric"
                  minLength={4}
                  maxLength={8}
                  placeholder="Unlocks real balance"
                  value={masterPin}
                  onChange={(e) => setMasterPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  required
                />
              </div>

              {error && (
                <div className="security-modal-error" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={13} />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-sm justify-center">
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Saving…' : 'Save PINs'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
