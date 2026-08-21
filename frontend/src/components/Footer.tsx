import { Shield } from 'lucide-react';
import './Footer.css';

const LINKS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Markets', href: '/markets' },
  { label: 'Trading', href: '/trading' },
  { label: 'Wallet', href: '/wallet' },
  { label: 'Security', href: '/security' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer__container">
        {/* Brand */}
        <div className="footer__brand">
          <div className="footer__logo">
            <Shield size={18} />
          </div>
          <div>
            <div className="footer__brand-name">CryptoGuard</div>
            <div className="footer__tagline">
              Research-only · Non-custodial · ARES-protected
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="footer__nav" aria-label="Footer navigation">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="footer__link">
              {l.label}
            </a>
          ))}
        </nav>

        {/* Legal */}
        <div className="footer__legal">
          <p>
            All prices are synthetic simulations for educational purposes only.
            This platform does not constitute financial advice.
          </p>
          <p>© {year} CryptoGuard. MIT License.</p>
        </div>
      </div>
    </footer>
  );
}
