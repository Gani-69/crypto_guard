import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Markets from './pages/Markets';
import CoinDetail from './pages/CoinDetail';
import Watchlist from './pages/Watchlist';
import Wallet from './pages/Wallet';
import Trading from './pages/Trading';
import Security from './pages/Security';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <NotificationProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/markets" element={<Markets />} />
                  <Route path="/coin/:symbol" element={<CoinDetail />} />
                  <Route path="/watchlist" element={<Watchlist />} />
                  <Route path="/wallet" element={<Wallet />} />
                  <Route path="/trading" element={<Trading />} />
                  <Route path="/security" element={<Security />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </NotificationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}


