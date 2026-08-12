import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Coin } from '../types';
import { formatUsd, formatPct } from '../types';
import './PriceCard.css';

interface Props {
  coin: Coin;
  style?: React.CSSProperties;
}

// Map of crypto symbols to emoji/unicode representations for visual identity
const CRYPTO_ICONS: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', SOL: '◎', BNB: '♦', XRP: '✕',
  ADA: '₳', DOGE: 'Ð', AVAX: '▲', DOT: '●', MATIC: '⬡',
  LINK: '⬡', UNI: '🦄', ATOM: '⚛', LTC: 'Ł', FIL: '⨍',
  NEAR: 'Ⓝ', APT: '∆', ARB: '◈', OP: '⭕', SUI: '💧',
};

const ICON_COLORS: Record<string, string> = {
  BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', BNB: '#f3ba2f', XRP: '#23292f',
  ADA: '#0033ad', DOGE: '#c2a633', AVAX: '#e84142', DOT: '#e6007a', MATIC: '#8247e5',
  LINK: '#2a5ada', UNI: '#ff007a', ATOM: '#2e3148', LTC: '#bfbbbb', FIL: '#0090ff',
  NEAR: '#00c08b', APT: '#000000', ARB: '#28a0f0', OP: '#ff0420', SUI: '#6fbcf0',
};

export default function PriceCard({ coin, style }: Props) {
  const isPositive = (coin.change24hPct ?? 0) >= 0;

  return (
    <Link to={`/coin/${coin.symbol}`} className="price-card card" style={style}>
      <div className="price-card__top">
        <div
          className="price-card__icon"
          style={{ background: `${ICON_COLORS[coin.symbol] ?? 'var(--cyan-500)'}22`, color: ICON_COLORS[coin.symbol] ?? 'var(--cyan-400)' }}
        >
          {CRYPTO_ICONS[coin.symbol] ?? coin.symbol[0]}
        </div>
        <div className="price-card__info">
          <span className="price-card__symbol">{coin.symbol}</span>
          <span className="price-card__name">{coin.name}</span>
        </div>
        <div className={`price-card__change ${isPositive ? 'price-card__change--up' : 'price-card__change--down'}`}>
          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {formatPct(coin.change24hPct)}
        </div>
      </div>
      <div className="price-card__price">{formatUsd(coin.priceUsd)}</div>
      <div className="price-card__meta">
        <span>MCap {formatUsd(coin.marketCapUsd ?? 0, true)}</span>
        <span>Vol {formatUsd(coin.volume24hUsd ?? 0, true)}</span>
      </div>
    </Link>
  );
}

export { CRYPTO_ICONS, ICON_COLORS };
