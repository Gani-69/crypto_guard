import { useState, useEffect } from 'react';
import { Bell, BellOff, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { formatUsd } from '../types';
import { useNotifications } from '../context/NotificationContext';
import './PriceAlerts.css';

interface Alert {
  id: number;
  symbol: string;
  targetPrice: number;
  direction: 'above' | 'below';
  triggered: boolean;
}

interface Props {
  symbol: string;
  currentPrice: number;
}

let nextAlertId = 0;

const LS_KEY = 'cryptoguard_price_alerts';

function loadAlerts(): Alert[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveAlerts(alerts: Alert[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(alerts));
}

export default function PriceAlerts({ symbol, currentPrice }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>(() => loadAlerts().filter(a => a.symbol === symbol));
  const [allAlerts, setAllAlerts] = useState<Alert[]>(() => loadAlerts());
  const [targetInput, setTargetInput] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [showForm, setShowForm] = useState(false);
  const { addNotification } = useNotifications();

  // Check alerts on price update
  useEffect(() => {
    const updatedAll = allAlerts.map((a) => {
      if (a.triggered || a.symbol !== symbol) return a;
      const hit =
        (a.direction === 'above' && currentPrice >= a.targetPrice) ||
        (a.direction === 'below' && currentPrice <= a.targetPrice);
      if (hit) {
        addNotification({
          title: `Price Alert: ${symbol}`,
          body: `${symbol} is now ${a.direction === 'above' ? 'above' : 'below'} ${formatUsd(a.targetPrice)}`,
          type: 'alert',
        });
        return { ...a, triggered: true };
      }
      return a;
    });

    if (JSON.stringify(updatedAll) !== JSON.stringify(allAlerts)) {
      setAllAlerts(updatedAll);
      setAlerts(updatedAll.filter(a => a.symbol === symbol));
      saveAlerts(updatedAll);
    }
  }, [currentPrice, symbol, allAlerts, addNotification]);

  const addAlert = () => {
    const price = parseFloat(targetInput);
    if (isNaN(price) || price <= 0) return;

    const newAlert: Alert = {
      id: ++nextAlertId,
      symbol,
      targetPrice: price,
      direction,
      triggered: false,
    };

    const newAll = [...allAlerts, newAlert];
    setAllAlerts(newAll);
    setAlerts(newAll.filter(a => a.symbol === symbol));
    saveAlerts(newAll);
    setTargetInput('');
    setShowForm(false);
  };

  const removeAlert = (id: number) => {
    const newAll = allAlerts.filter(a => a.id !== id);
    setAllAlerts(newAll);
    setAlerts(newAll.filter(a => a.symbol === symbol));
    saveAlerts(newAll);
  };

  return (
    <div className="price-alerts">
      <div className="price-alerts__header">
        <div className="price-alerts__title">
          <Bell size={14} />
          Price Alerts
          {alerts.filter(a => !a.triggered).length > 0 && (
            <span className="price-alerts__count">{alerts.filter(a => !a.triggered).length}</span>
          )}
        </div>
        <button
          className="price-alerts__add-btn btn btn-secondary"
          onClick={() => setShowForm(f => !f)}
        >
          <Plus size={13} />
          Set Alert
        </button>
      </div>

      {/* Add Alert Form */}
      {showForm && (
        <div className="price-alerts__form">
          <div className="price-alerts__direction-toggle">
            <button
              className={`price-alerts__dir-btn ${direction === 'above' ? 'price-alerts__dir-btn--active' : ''}`}
              onClick={() => setDirection('above')}
            >
              <ArrowUp size={12} /> Above
            </button>
            <button
              className={`price-alerts__dir-btn ${direction === 'below' ? 'price-alerts__dir-btn--active' : ''}`}
              onClick={() => setDirection('below')}
            >
              <ArrowDown size={12} /> Below
            </button>
          </div>
          <div className="price-alerts__input-row">
            <span className="price-alerts__currency">$</span>
            <input
              type="number"
              className="price-alerts__input"
              placeholder={`e.g. ${(currentPrice * (direction === 'above' ? 1.05 : 0.95)).toFixed(0)}`}
              value={targetInput}
              onChange={e => setTargetInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addAlert()}
            />
            <button className="btn btn-primary" onClick={addAlert} style={{ padding: '6px 14px' }}>
              Add
            </button>
          </div>
          <div className="price-alerts__hint">
            Current price: {formatUsd(currentPrice)}
          </div>
        </div>
      )}

      {/* Alert List */}
      {alerts.length > 0 && (
        <div className="price-alerts__list">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`price-alerts__item ${alert.triggered ? 'price-alerts__item--triggered' : ''}`}
            >
              <span className="price-alerts__item-icon">
                {alert.triggered ? <BellOff size={13} /> : alert.direction === 'above' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
              </span>
              <span className="price-alerts__item-label">
                {alert.direction === 'above' ? 'Above' : 'Below'} {formatUsd(alert.targetPrice)}
              </span>
              {alert.triggered && <span className="price-alerts__triggered-badge">Triggered</span>}
              <button
                className="price-alerts__remove-btn"
                onClick={() => removeAlert(alert.id)}
                title="Remove alert"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {alerts.length === 0 && !showForm && (
        <p className="price-alerts__empty">No alerts set for {symbol}</p>
      )}
    </div>
  );
}
