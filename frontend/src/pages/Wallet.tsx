import { useState, useEffect } from 'react';
import { useWallet, useTransactions, useCoins } from '../hooks/useMarketData';
import { formatUsd } from '../types';
import * as api from '../api/client';
import {
  Copy,
  Check,
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownLeft,
  Sliders,
  AlertCircle,
  Award,
  Lock,
  Unlock,
  ShieldCheck,
  Smartphone,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNotifications } from '../context/NotificationContext';
import PinSetupModal from '../components/PinSetupModal';
import './Wallet.css';

export default function Wallet() {
  const { user, session, submitKyc } = useAuth();
  const { showToast } = useToast();
  const { addNotification } = useNotifications();
  const { coins } = useCoins();
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  // KYC Verification state
  const isKycVerified =
    user?.kycStatus === 'VERIFIED' ||
    user?.email === 'demo@cryptoguard.dev' ||
    user?.email === 'admin@cryptoguard.dev';

  const [kycName, setKycName] = useState(user?.displayName || '');
  const [kycPan, setKycPan] = useState('');
  const [kycAadhaar, setKycAadhaar] = useState('');
  const [kycMethod, setKycMethod] = useState<'UPI' | 'BANK'>('UPI');
  const [kycUpiId, setKycUpiId] = useState('');
  const [kycBankAcc, setKycBankAcc] = useState('');
  const [kycIfsc, setKycIfsc] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  // F3: PIN gate state — backed by /api/pin/check-balance.
  // The server enforces I6: SHADOW sessions always return decoy regardless of PIN.
  // Client only drives display from the 'outcome' field returned by the server.
  const { isUnlocked, setIsUnlocked } = useAuth();
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  // PIN setup prompt: shown when pinsConfigured=false after first wallet load
  const [pinsConfigured, setPinsConfigured] = useState<boolean | null>(null);
  const [showPinSetup, setShowPinSetup] = useState(false);

  // Hook mappings bound to active decoy mode state
  const decoyMode = !isUnlocked;
  const { walletData: activeWalletData, loading: activeWalletLoading, refetch: refetchActiveWallet } = useWallet(decoyMode);
  const { transactions: activeTransactions, loading: activeTxLoading, refetch: refetchActiveTransactions } = useTransactions(15, decoyMode);

  // Web3 MetaMask states
  const [web3Address, setWeb3Address] = useState<string | null>(null);
  const [web3Balance, setWeb3Balance] = useState<number | null>(null);
  const [web3Loading, setWeb3Loading] = useState(false);

  // Active view: 'HOLDINGS' | 'DEPOSIT' | 'WITHDRAWAL'
  const [activeTab, setActiveTab] = useState<'HOLDINGS' | 'DEPOSIT' | 'WITHDRAWAL'>('HOLDINGS');

  // INR Deposit Wizard States
  const [depStep, setDepStep] = useState(1); // Steps: 1 (Amount), 2 (Method), 3 (Payment & UTR), 4 (Success)
  const [depAmount, setDepAmount] = useState<number | ''>('');
  const [depMethod, setDepMethod] = useState<'UPI' | 'IMPS'>('UPI');
  const [depUTR, setDepUTR] = useState('');
  const [depError, setDepError] = useState<string | null>(null);
  const [depLoading, setDepLoading] = useState(false);

  // INR Withdrawal States
  const [withStep, setWithStep] = useState(1); // Steps: 1 (Amount & Details), 2 (Success)
  const [withAmount, setWithAmount] = useState<number | ''>('');
  const [withDetails, setWithDetails] = useState('');
  const [withError, setWithError] = useState<string | null>(null);
  const [withLoading, setWithLoading] = useState(false);

  // Sync connected MetaMask account on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (typeof (window as any).ethereum !== 'undefined') {
        const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          const address = accounts[0];
          setWeb3Address(address);
          const balanceHex = await (window as any).ethereum.request({
            method: 'eth_getBalance',
            params: [address, 'latest'],
          });
          const balanceEth = parseInt(balanceHex, 16) / 1e18;
          setWeb3Balance(balanceEth);
        }
      }
    };
    checkConnection();
  }, []);

  // Pre-fill mock UTR reference when step 3 loads to bypass manual KYC entry requirements
  useEffect(() => {
    if (depStep === 3) {
      const mockUtr = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
      setDepUTR(mockUtr);
    }
  }, [depStep]);

  // F3: Check if the user has configured PINs yet (for the setup prompt)
  useEffect(() => {
    fetch('/api/pin/status')
      .then((res) => res.ok ? res.json() : { pinsConfigured: false })
      .then((data) => setPinsConfigured(data.pinsConfigured))
      .catch(() => setPinsConfigured(false));
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setCopiedText('');
    }, 2000);
  };

  // F3: PIN check — calls /api/pin/check-balance.
  // The server resolves I6 (Shadow bypass) FIRST, then PIN identity.
  // We only update isUnlocked when outcome === 'normal_master'.
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinLoading(true);
    try {
      const res = await fetch('/api/pin/check-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data.message || 'PIN check failed');
        return;
      }
      // I6: outcome drives display, not the PIN value itself
      if (data.outcome === 'normal_master') {
        setIsUnlocked(true);
        setShowPinModal(false);
        setPinInput('');
        refetchActiveWallet();
        refetchActiveTransactions();
      } else {
        // shadow_bypass or normal_decoy — silently stay in decoy mode
        setShowPinModal(false);
        setPinInput('');
      }
    } catch (err: any) {
      setPinError('Network error. Please try again.');
    } finally {
      setPinLoading(false);
    }
  };

  const connectWeb3 = async () => {
    if (typeof (window as any).ethereum === 'undefined') {
      alert('MetaMask is not installed. Please install it to import live assets.');
      return;
    }
    try {
      setWeb3Loading(true);
      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        const address = accounts[0];
        setWeb3Address(address);
        const balanceHex = await (window as any).ethereum.request({
          method: 'eth_getBalance',
          params: [address, 'latest'],
        });
        const balanceEth = parseInt(balanceHex, 16) / 1e18;
        setWeb3Balance(balanceEth);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Web3 connection failed');
    } finally {
      setWeb3Loading(false);
    }
  };

  // Handle KYC Verification
  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycError(null);

    if (!kycPan || kycPan.trim().length < 10) {
      setKycError('Please enter a valid 10-character PAN number (e.g. ABCDE1234F).');
      return;
    }
    if (!kycAadhaar || kycAadhaar.trim().length !== 4 || isNaN(Number(kycAadhaar))) {
      setKycError('Please enter the last 4 numeric digits of your Aadhaar card.');
      return;
    }
    if (kycMethod === 'UPI' && !kycUpiId.trim()) {
      setKycError('Please enter your PhonePe / Google Pay UPI ID.');
      return;
    }
    if (kycMethod === 'BANK' && (!kycBankAcc.trim() || !kycIfsc.trim())) {
      setKycError('Please enter your Bank Account number and IFSC code.');
      return;
    }

    setKycLoading(true);

    try {
      await submitKyc({
        fullName: kycName || user?.displayName || user?.email?.split('@')[0],
        panNumber: kycPan,
        aadhaarLast4: kycAadhaar,
        paymentMethod: kycMethod,
        upiId: kycMethod === 'UPI' ? kycUpiId : undefined,
        bankAccount: kycMethod === 'BANK' ? kycBankAcc : undefined,
        ifsc: kycMethod === 'BANK' ? kycIfsc : undefined,
      });

      showToast('KYC Verified successfully! Your trading wallet is now active.', 'success');
      addNotification({
        title: 'KYC Verification Complete',
        body: 'Identity & real-time payment linked. Your wallet is active for deposits.',
        type: 'system',
      });
      refetchActiveWallet();
    } catch (err: any) {
      setKycError(err.message || 'KYC verification failed.');
      showToast(err.message || 'KYC verification failed', 'error');
    } finally {
      setKycLoading(false);
    }
  };

  // Handle deposit UTR verification
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepError(null);

    if (!depAmount || Number(depAmount) <= 0) {
      setDepError('Please enter a valid deposit amount.');
      return;
    }
    if (depUTR.length !== 12 || isNaN(Number(depUTR))) {
      setDepError('UTR Reference must be a 12-digit numeric code.');
      return;
    }

    setDepLoading(true);

    try {
      // Find the INR coin ID dynamically
      const inrCoin = coins.find((c) => c.symbol === 'INR');
      if (!inrCoin) {
        throw new Error('INR fiat currency ledger not found.');
      }

      await api.createTransaction({
        type: 'DEPOSIT',
        coinId: inrCoin.id,
        amount: Number(depAmount),
        decoy: decoyMode,
      });

      setDepStep(4);
      showToast(`₹${Number(depAmount).toLocaleString('en-IN')} deposited successfully`, 'success');
      addNotification({
        title: 'Deposit Successful',
        body: `₹${Number(depAmount).toLocaleString('en-IN')} added to INR cash balance.`,
        type: 'deposit',
      });
      refetchActiveWallet();
      refetchActiveTransactions();
    } catch (err: any) {
      setDepError(err.message || 'Deposit verification failed.');
      showToast(err.message || 'Deposit verification failed', 'error');
    } finally {
      setDepLoading(false);
    }
  };

  // Handle withdrawal submission
  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithError(null);

    if (!withAmount || Number(withAmount) <= 0) {
      setWithError('Please enter a valid amount.');
      return;
    }
    if (!withDetails.trim()) {
      setWithError('Bank account details or UPI ID are required.');
      return;
    }

    // Check we have enough INR Cash balance
    const inrHolding = holdings.find((h) => h.symbol === 'INR');
    const currentInrBalance = inrHolding?.amount ?? 0;
    if (currentInrBalance < Number(withAmount)) {
      setWithError(`Insufficient balance. Available Cash: ₹${currentInrBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      return;
    }

    setWithLoading(true);

    try {
      const inrCoin = coins.find((c) => c.symbol === 'INR');
      if (!inrCoin) {
        throw new Error('INR fiat currency ledger not found.');
      }

      await api.createTransaction({
        type: 'WITHDRAWAL',
        coinId: inrCoin.id,
        amount: Number(withAmount),
        decoy: decoyMode,
      });

      setWithStep(2);
      showToast(`₹${Number(withAmount).toLocaleString('en-IN')} withdrawal initiated`, 'success');
      addNotification({
        title: 'Withdrawal Initiated',
        body: `₹${Number(withAmount).toLocaleString('en-IN')} withdrawal request submitted.`,
        type: 'deposit',
      });
      refetchActiveWallet();
      refetchActiveTransactions();
    } catch (err: any) {
      setWithError(err.message || 'Withdrawal execution failed.');
      showToast(err.message || 'Withdrawal execution failed', 'error');
    } finally {
      setWithLoading(false);
    }
  };

  const resetDepositWizard = () => {
    setDepStep(1);
    setDepAmount('');
    setDepUTR('');
    setDepError(null);
  };

  const resetWithdrawalWizard = () => {
    setWithStep(1);
    setWithAmount('');
    setWithDetails('');
    setWithError(null);
  };

  const isLoading = activeWalletLoading || activeTxLoading;

  if (isLoading && !activeWalletData) {
    return (
      <div className="wallet fade-in">
        <div className="wallet__header" style={{ marginBottom: 12 }}>
          <div className="skeleton" style={{ height: 28, width: 220 }} />
          <div className="skeleton" style={{ height: 16, width: 280, marginTop: 8 }} />
        </div>
        <div className="skeleton" style={{ height: 140, borderRadius: 16, marginBottom: 24 }} />
        <div className="wallet__grid">
          <div className="card" style={{ padding: 24 }}>
            <div className="skeleton" style={{ height: 20, width: 140, marginBottom: 20 }} />
            <div className="flex flex-col gap-md">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border-default)' }}>
                  <div className="skeleton" style={{ height: 16, width: 60 }} />
                  <div className="skeleton" style={{ height: 16, width: 60 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const wallet = activeWalletData?.wallet;
  const holdings = activeWalletData?.holdings ?? [];
  const totalValue = activeWalletData?.totalValueUsd ?? 0;

  // INR Cash balance
  const inrCash = holdings.find((h) => h.symbol === 'INR')?.amount ?? 0;

  return (
    <div className="wallet fade-in">
      <div className="wallet__header">
        <h1>INR Wallet & Cashbook</h1>
        <p className="text-secondary">CoinDCX styled fiat payment simulation gateway with ARES shadow support</p>
      </div>

      {/* ── KYC Verification Banner / Form ── */}
      {!isKycVerified ? (
        <div className="wallet__kyc-card card-glass fade-in">
          <div className="wallet__kyc-header">
            <div>
              <h2>KYC Identity & Real-time Payment Verification</h2>
              <p className="text-secondary" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Complete a fast verification to activate your INR Trading Wallet and connect PhonePe / UPI / Bank gateways.
              </p>
            </div>
            <span className="wallet__kyc-badge wallet__kyc-badge--pending">KYC Pending</span>
          </div>

          <form onSubmit={handleKycSubmit} className="wallet__kyc-form">
            <div className="wallet__form-field">
              <label htmlFor="kyc-name">Full Legal Name</label>
              <input
                id="kyc-name"
                type="text"
                placeholder="e.g. Durgaprasad K"
                value={kycName}
                onChange={(e) => setKycName(e.target.value)}
                required
              />
            </div>

            <div className="wallet__form-field">
              <label htmlFor="kyc-pan">PAN Card Number (10 Characters)</label>
              <input
                id="kyc-pan"
                type="text"
                maxLength={10}
                placeholder="ABCDE1234F"
                value={kycPan}
                onChange={(e) => setKycPan(e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase' }}
                required
              />
            </div>

            <div className="wallet__form-field">
              <label htmlFor="kyc-aadhaar">Aadhaar Card (Last 4 Digits)</label>
              <input
                id="kyc-aadhaar"
                type="text"
                maxLength={4}
                placeholder="XXXX-XXXX-1234"
                value={kycAadhaar}
                onChange={(e) => setKycAadhaar(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <div className="wallet__form-field">
              <label>Link Real-time Payment Method</label>
              <div className="wallet__payment-toggle">
                <button
                  type="button"
                  className={`wallet__payment-btn ${kycMethod === 'UPI' ? 'wallet__payment-btn--active' : ''}`}
                  onClick={() => setKycMethod('UPI')}
                >
                  <Smartphone size={14} /> PhonePe / UPI ID
                </button>
                <button
                  type="button"
                  className={`wallet__payment-btn ${kycMethod === 'BANK' ? 'wallet__payment-btn--active' : ''}`}
                  onClick={() => setKycMethod('BANK')}
                >
                  <Building2 size={14} /> Bank Account
                </button>
              </div>
            </div>

            {kycMethod === 'UPI' ? (
              <div className="wallet__form-field wallet__kyc-form-full">
                <label htmlFor="kyc-upi">PhonePe / Google Pay / BHIM UPI ID</label>
                <input
                  id="kyc-upi"
                  type="text"
                  placeholder="e.g. yourname@ybl, yourname@okhdfcbank"
                  value={kycUpiId}
                  onChange={(e) => setKycUpiId(e.target.value)}
                  required
                />
              </div>
            ) : (
              <>
                <div className="wallet__form-field">
                  <label htmlFor="kyc-acc">Bank Account Number</label>
                  <input
                    id="kyc-acc"
                    type="text"
                    placeholder="e.g. 1029384756"
                    value={kycBankAcc}
                    onChange={(e) => setKycBankAcc(e.target.value)}
                    required
                  />
                </div>
                <div className="wallet__form-field">
                  <label htmlFor="kyc-ifsc">Bank IFSC Code</label>
                  <input
                    id="kyc-ifsc"
                    type="text"
                    placeholder="e.g. SBIN0001234"
                    value={kycIfsc}
                    onChange={(e) => setKycIfsc(e.target.value.toUpperCase())}
                    style={{ textTransform: 'uppercase' }}
                    required
                  />
                </div>
              </>
            )}

            {kycError && (
              <div className="wallet__kyc-form-full">
                <div className="wallet__form-alert wallet__form-alert--error" style={{ display: 'flex', gap: 6, padding: '8px 12px', borderRadius: 4 }}>
                  <AlertCircle size={14} />
                  <span>{kycError}</span>
                </div>
              </div>
            )}

            <div className="wallet__kyc-form-full flex justify-end mt-sm">
              <button type="submit" className="btn btn-primary" disabled={kycLoading}>
                {kycLoading ? 'Verifying Identity...' : (
                  <>
                    <ShieldCheck size={16} /> Verify &amp; Activate Trading Wallet
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="wallet__kyc-banner fade-in">
          <div className="wallet__kyc-banner-content">
            <div className="wallet__kyc-banner-icon" style={{ background: 'rgba(3, 197, 139, 0.15)', color: 'var(--green-400)' }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h3>KYC Verified &amp; Wallet Active</h3>
              <p>Your identity &amp; real-time payment gateway are linked. You can deposit INR or trade seamlessly.</p>
            </div>
          </div>
          <span className="wallet__kyc-badge wallet__kyc-badge--verified">Verified</span>
        </div>
      )}



      {/* Top row: Balance card and Web3 panel */}
      <div className="wallet__top-grid">
        {/* Total portfolio valuation */}
        <div className="wallet__balance-card card-glass">
          <div className="wallet__balance-left">
            <div className="flex items-center gap-sm">
              <span className="wallet__balance-label">INR Cash Balance</span>
              {session?.state !== 'SHADOW' && (
                <button
                  className="wallet__lock-toggle"
                  onClick={() => {
                    if (isUnlocked) {
                      setIsUnlocked(false);
                    } else {
                      setShowPinModal(true);
                    }
                  }}
                  title={isUnlocked ? "Click to lock and return to sandbox decoy wallet" : "Click to unlock authentic wallet"}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center' }}
                >
                  {isUnlocked ? <Unlock size={13} className="text-green" /> : <Lock size={13} className="text-red" />}
                </button>
              )}
            </div>
            <span className="wallet__balance-value" style={{ color: 'var(--cyan-400)' }}>
              {`₹${inrCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
            
            <div className="flex items-center gap-md mt-sm">
              <div className="wallet__address-row">
                <span className="wallet__address-title">Total Portfolio Value:</span>
                <span className="font-bold text-primary ml-xs" style={{ fontSize: '0.85rem' }}>{formatUsd(totalValue)}</span>
              </div>
              {wallet && (
                <div className="wallet__address-row" style={{ marginLeft: 8 }}>
                  <span className="wallet__address-title">Address:</span>
                  <code className="wallet__address-value">{wallet.address.slice(0, 14)}...</code>
                  <button className="wallet__copy-btn" onClick={() => handleCopy(wallet.address)} title="Copy address">
                    {copied && copiedText === wallet.address ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="wallet__balance-right">
            <div className="wallet__chain-badge">
              <span className="wallet__chain-dot" />
              <span>Simulated INR Ledger</span>
            </div>
          </div>
        </div>

        {/* Web3 wallet connection */}
        <div className="wallet__web3-card card-glass">
          <div className="wallet__web3-header">
            <div className="flex items-center gap-sm">
              <span className="wallet__web3-status-dot" style={{ background: web3Address ? 'var(--green-400)' : 'var(--text-muted)' }} />
              <span className="wallet__balance-label" style={{ margin: 0 }}>Web3 MetaMask Import</span>
            </div>
            <span className="wallet__chain-badge" style={{ background: 'rgba(255, 109, 0, 0.1)', color: 'var(--cyan-400)', border: '1px solid rgba(255, 109, 0, 0.2)' }}>
              Ethereum Mainnet
            </span>
          </div>

          {web3Address ? (
            <div className="wallet__web3-connected">
              <div className="wallet__web3-row">
                <span className="wallet__address-title">Address:</span>
                <code className="wallet__address-value" style={{ fontSize: '0.72rem' }}>{web3Address}</code>
              </div>
              <div className="wallet__web3-row flex items-center gap-sm mt-xs">
                <span className="wallet__address-title">ETH Balance (Live):</span>
                <span className="font-semibold text-cyan">{web3Balance?.toFixed(4)} ETH</span>
                {coins.find(c => c.symbol === 'ETH') && (
                  <span className="text-secondary text-xs">
                    ({formatUsd((web3Balance ?? 0) * (coins.find(c => c.symbol === 'ETH')?.priceUsd ?? 0))})
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="wallet__web3-disconnected">
              <p className="text-secondary text-xs mb-sm">Import your live wallet assets securely via MetaMask to display actual balances alongside simulated rates.</p>
              <button className="btn btn-secondary btn-sm" onClick={connectWeb3} disabled={web3Loading} style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
                {web3Loading ? 'Connecting...' : 'Connect MetaMask'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Segmented workspace tabs */}
      <div className="wallet__workspace-selector">
        <button
          className={`wallet__workspace-btn ${activeTab === 'HOLDINGS' ? 'wallet__workspace-btn--active' : ''}`}
          onClick={() => setActiveTab('HOLDINGS')}
        >
          My Portfolio Holdings
        </button>
        <button
          className={`wallet__workspace-btn ${activeTab === 'DEPOSIT' ? 'wallet__workspace-btn--active' : ''}`}
          onClick={() => { setActiveTab('DEPOSIT'); resetDepositWizard(); }}
        >
          INR Deposit Gateway
        </button>
        <button
          className={`wallet__workspace-btn ${activeTab === 'WITHDRAWAL' ? 'wallet__workspace-btn--active' : ''}`}
          onClick={() => { setActiveTab('WITHDRAWAL'); resetWithdrawalWizard(); }}
        >
          INR Bank Withdrawal
        </button>
      </div>

      {/* Main Grid: Render active tab content */}
      <div className="wallet__grid">
        {activeTab === 'HOLDINGS' && (
          <div className="wallet__holdings card" style={{ gridColumn: 'span 2' }}>
            <div className="wallet__section-header">
              <WalletIcon size={18} className="text-cyan" />
              <h2>Holdings Ledger</h2>
            </div>
            {holdings.length === 0 ? (
              <div className="wallet__empty">
                <p className="text-muted">No holdings found. Deposit cash to begin simulated trading!</p>
              </div>
            ) : (
              <div className="wallet__table-wrap">
                <table className="wallet-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th style={{ textAlign: 'right' }}>Quantity</th>
                      <th style={{ textAlign: 'right' }}>Current Price</th>
                      <th style={{ textAlign: 'right' }}>Valuation (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <div className="wallet__asset-cell">
                            <span className="wallet__asset-symbol">{h.symbol}</span>
                            <span className="wallet__asset-name">{h.name}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-semibold font-mono">
                          {h.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                        </td>
                        <td style={{ textAlign: 'right' }} className="text-secondary font-mono">
                          {formatUsd(h.priceUsd)}
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-semibold text-cyan font-mono">
                          {formatUsd(h.valueUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* INR Deposit Wizard */}
        {activeTab === 'DEPOSIT' && (
          <div className="wallet__deposit-wizard card" style={{ gridColumn: 'span 2' }}>
            <div className="wallet__section-header">
              <Sliders size={18} className="text-cyan" />
              <h2>INR Deposit Simulator (Step {depStep} of 4)</h2>
            </div>

            {depStep === 1 && (
              <div className="wallet__wizard-step">
                <p className="text-secondary mb-md">Enter the amount you would like to deposit to your simulated trading account.</p>
                <div className="wallet__form-field max-w-sm mb-md">
                  <label htmlFor="dep-amount">DEPOSIT AMOUNT (INR)</label>
                  <input
                    id="dep-amount"
                    type="number"
                    min="100"
                    placeholder="₹500, ₹10,000, etc."
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (depAmount && Number(depAmount) >= 100) setDepStep(2);
                    else alert('Minimum deposit amount is ₹100.');
                  }}
                >
                  Continue to Payment Method
                </button>
              </div>
            )}

            {depStep === 2 && (
              <div className="wallet__wizard-step">
                <p className="text-secondary mb-md">Select your preferred transaction method to transfer ₹{depAmount}:</p>
                <div className="wallet__gateway-options flex flex-col gap-sm max-w-md mb-md">
                  <div
                    className={`wallet__gateway-box ${depMethod === 'UPI' ? 'wallet__gateway-box--active' : ''}`}
                    onClick={() => setDepMethod('UPI')}
                  >
                    <span className="font-bold">Instant UPI Transfer</span>
                    <span className="text-muted text-xs">Send instantly via Google Pay, PhonePe, or BHIM.</span>
                  </div>
                  <div
                    className={`wallet__gateway-box ${depMethod === 'IMPS' ? 'wallet__gateway-box--active' : ''}`}
                    onClick={() => setDepMethod('IMPS')}
                  >
                    <span className="font-bold">IMPS / NEFT Bank Transfer</span>
                    <span className="text-muted text-xs">Transfer directly into target escrow account.</span>
                  </div>
                </div>
                <div className="flex gap-sm">
                  <button className="btn btn-secondary" onClick={() => setDepStep(1)}>Back</button>
                  <button className="btn btn-primary" onClick={() => setDepStep(3)}>Continue to Instructions</button>
                </div>
              </div>
            )}

            {depStep === 3 && (
              <form onSubmit={handleDepositSubmit} className="wallet__wizard-step max-w-md">
                <p className="text-secondary mb-sm">Transfer ₹{depAmount} to the escrow credentials below using your payment app:</p>

                {depMethod === 'UPI' ? (
                  <div className="wallet__escrow-card mb-md flex flex-col items-center gap-sm">
                    <span className="text-xs text-muted uppercase font-bold">Scan QR Code to Transfer</span>
                    
                    {/* Dynamically generated UPI payment QR code */}
                    <div className="wallet__qr-container">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                          `upi://pay?pa=escrow@cryptoguard&pn=CryptoGuard&am=${depAmount}&cu=INR&tn=CryptoGuard%20Wallet%20Funding`
                        )}`} 
                        alt="UPI QR Code" 
                        className="wallet__qr-code" 
                      />
                      <span className="wallet__qr-caption">escrow@cryptoguard</span>
                    </div>

                    <div className="flex justify-between items-center w-full mt-xs" style={{ borderTop: '1px dashed var(--border-default)', paddingTop: 10 }}>
                      <span className="text-xs text-secondary">UPI ID: escrow@cryptoguard</span>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleCopy('escrow@cryptoguard')}>Copy ID</button>
                    </div>
                  </div>
                ) : (
                  <div className="wallet__escrow-card mb-md flex flex-col gap-xs">
                    <div>
                      <span className="text-xs text-muted uppercase block">Account Number</span>
                      <code className="text-cyan font-bold font-mono">1029384756</code>
                      <button type="button" className="btn btn-ghost btn-xs ml-sm" onClick={() => handleCopy('1029384756')}>Copy</button>
                    </div>
                    <div>
                      <span className="text-xs text-muted uppercase block">IFSC Code</span>
                      <code className="text-cyan font-bold font-mono">CGIB0001092</code>
                      <button type="button" className="btn btn-ghost btn-xs ml-sm" onClick={() => handleCopy('CGIB0001092')}>Copy</button>
                    </div>
                    <div>
                      <span className="text-xs text-muted uppercase block">Bank Name</span>
                      <strong className="text-primary text-xs">CryptoGuard Escrow Bank</strong>
                    </div>
                  </div>
                )}

                <div className="wallet__form-field mb-md">
                  <label htmlFor="dep-utr">Transaction Reference (UTR - Auto-generated for Sandbox)</label>
                  <input
                    id="dep-utr"
                    type="text"
                    maxLength={12}
                    placeholder="Auto-generated UTR code"
                    value={depUTR}
                    onChange={(e) => setDepUTR(e.target.value)}
                    required
                  />
                  <p className="text-muted" style={{ fontSize: '0.68rem', marginTop: 4 }}>
                    We prefilled this with a sandbox reference so you do not need a real bank account to test.
                  </p>
                </div>

                {depError && (
                  <div className="wallet__form-alert wallet__form-alert--error mb-sm" style={{ display: 'flex', gap: 6, padding: '8px 12px', borderRadius: 4 }}>
                    <AlertCircle size={14} />
                    <span>{depError}</span>
                  </div>
                )}

                <div className="flex gap-sm">
                  <button type="button" className="btn btn-secondary" onClick={() => setDepStep(2)} disabled={depLoading}>Back</button>
                  <button type="submit" className="btn btn-primary" disabled={depLoading}>
                    {depLoading ? 'Verifying Reference...' : 'Verify & Complete'}
                  </button>
                </div>
              </form>
            )}

            {depStep === 4 && (
              <div className="wallet__wizard-step flex flex-col items-center justify-center text-center py-lg">
                <div className="wallet__success-icon flex items-center justify-center">
                  <Award size={36} className="text-green" />
                </div>
                <h3 className="text-green font-bold text-lg mt-md">Deposit Verified Successfully!</h3>
                <p className="text-secondary max-w-sm mt-sm">We verified UTR reference: <code className="font-mono text-cyan">{depUTR}</code>. Your cash account has been credited with ₹{depAmount.toLocaleString('en-IN')}.</p>
                <button className="btn btn-primary mt-lg" onClick={() => { setActiveTab('HOLDINGS'); resetDepositWizard(); }}>
                  Go to Portfolio Holdings
                </button>
              </div>
            )}
          </div>
        )}

        {/* INR Withdrawal Gateway */}
        {activeTab === 'WITHDRAWAL' && (
          <div className="wallet__deposit-wizard card" style={{ gridColumn: 'span 2' }}>
            <div className="wallet__section-header">
              <Sliders size={18} className="text-cyan" />
              <h2>INR Cash Out (Step {withStep} of 2)</h2>
            </div>

            {withStep === 1 ? (
              <form onSubmit={handleWithdrawalSubmit} className="wallet__wizard-step max-w-md">
                <p className="text-secondary mb-md">Withdraw your INR cash directly to your bank account or UPI ID. Available balance: <strong className="text-cyan">{`₹${inrCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</strong></p>

                <div className="wallet__form-field mb-sm">
                  <label htmlFor="with-amount">WITHDRAW AMOUNT (INR)</label>
                  <input
                    id="with-amount"
                    type="number"
                    min="100"
                    placeholder="₹500, ₹5,000, etc."
                    value={withAmount}
                    onChange={(e) => setWithAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>

                <div className="wallet__form-field mb-md">
                  <label htmlFor="with-details">Bank Escrow Account (IFSC / Number) or UPI Handle</label>
                  <input
                    id="with-details"
                    type="text"
                    placeholder="e.g. UPI: name@upi or Bank: AccountNo, IFSC"
                    value={withDetails}
                    onChange={(e) => setWithDetails(e.target.value)}
                    required
                  />
                </div>

                {withError && (
                  <div className="wallet__form-alert wallet__form-alert--error mb-sm" style={{ display: 'flex', gap: 6, padding: '8px 12px', borderRadius: 4 }}>
                    <AlertCircle size={14} />
                    <span>{withError}</span>
                  </div>
                )}

                <button type="submit" className="btn btn-danger" disabled={withLoading}>
                  {withLoading ? 'Processing withdrawal...' : 'Withdraw Cash'}
                </button>
              </form>
            ) : (
              <div className="wallet__wizard-step flex flex-col items-center justify-center text-center py-lg">
                <div className="wallet__success-icon flex items-center justify-center" style={{ background: 'rgba(244, 67, 54, 0.15)', color: 'var(--red-400)' }}>
                  <Award size={36} />
                </div>
                <h3 className="text-red font-bold text-lg mt-md">Withdrawal Submitted Successfully!</h3>
                <p className="text-secondary max-w-sm mt-sm">Your request to withdraw ₹{withAmount.toLocaleString('en-IN')} has been sent to processing at destination: <code className="text-cyan">{withDetails}</code>.</p>
                <button className="btn btn-primary mt-lg" onClick={() => { setActiveTab('HOLDINGS'); resetWithdrawalWizard(); }}>
                  Go to Portfolio Holdings
                </button>
              </div>
            )}
          </div>
        )}

        {/* Recent Transactions / Cash logs */}
        <div className="wallet__transactions card" style={{ gridColumn: 'span 2' }}>
          <div className="wallet__section-header">
            <ArrowUpRight size={18} className="text-purple-400" />
            <h2>Cash Ledger Activity</h2>
          </div>
          {activeTransactions.length === 0 ? (
            <div className="wallet__empty">
              <p className="text-muted">No transactions logged yet.</p>
            </div>
          ) : (
            <div className="wallet__tx-list">
              {activeTransactions.map((tx) => {
                const isBuy = tx.type === 'BUY' || tx.type === 'DEPOSIT';
                return (
                  <div key={tx.id} className="wallet__tx-item">
                    <div className={`wallet__tx-icon ${isBuy ? 'wallet__tx-icon--buy' : 'wallet__tx-icon--sell'}`}>
                      {isBuy ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div className="wallet__tx-info">
                      <span className="wallet__tx-title">
                        {tx.type} {tx.coinSymbol}
                      </span>
                      <span className="wallet__tx-date">
                        {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="wallet__tx-amounts">
                      <span className={`wallet__tx-amount ${isBuy ? 'text-green' : 'text-red'}`}>
                        {isBuy ? '+' : '-'}{tx.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {tx.coinSymbol}
                      </span>
                      <span className="wallet__tx-value font-mono">
                        {formatUsd(tx.totalUsd)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* F3: PIN setup prompt — shown when PINs not yet configured */}
      {pinsConfigured === false && !showPinSetup && (
        <div className="wallet__pin-setup-banner card-glass fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Lock size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Set up your Master PIN</strong>
              <p className="text-muted" style={{ fontSize: '0.76rem', marginTop: 2 }}>
                Configure a Master PIN to gate access to your authentic balance. A decoy balance is shown to unauthorized viewers.
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowPinSetup(true)}>
            Set up PINs
          </button>
        </div>
      )}

      {/* F3: PIN setup modal */}
      {showPinSetup && (
        <PinSetupModal
          onSuccess={() => { setShowPinSetup(false); setPinsConfigured(true); }}
          onCancel={() => setShowPinSetup(false)}
        />
      )}

      {/* F3: Master PIN Verification Modal (API-backed, I6 enforced server-side) */}
      {showPinModal && (
        <div className="security-modal-overlay">
          <div className="security-modal-card card-glass fade-in">
            <div className="security-modal-icon flex justify-center items-center" style={{ background: 'rgba(255, 109, 0, 0.1)', color: 'var(--cyan-400)' }}>
              <Lock size={28} />
            </div>
            <h2>Unlock Authentic Ledger</h2>
            <p className="text-secondary text-center" style={{ fontSize: '0.8rem', lineHeight: 1.4, margin: '8px 0 16px' }}>
              Enter your Master Security PIN to access authentic holdings.
            </p>
            <form onSubmit={handlePinSubmit} className="security-modal-form flex flex-col gap-md">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                placeholder="Enter PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                required
              />
              {pinError && (
                <div className="security-modal-error">
                  <span>{pinError}</span>
                </div>
              )}
              <div className="flex gap-sm justify-center">
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={pinLoading}>
                  {pinLoading ? 'Verifying…' : 'Unlock Wallet'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowPinModal(false); setPinInput(''); setPinError(null); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
