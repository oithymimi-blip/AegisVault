import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import UserPage from './pages/UserPage';
import AdminPage from './pages/AdminPage';
import SignupLogPage from './pages/SignupLogPage';
import { CONTRACT, CHAIN_ID } from './api';

export default function App() {
  const location = useLocation();
  const isSuper = location.pathname.startsWith('/super');
  const isSignupLog = location.pathname.startsWith('/admin');

  if (isSignupLog) {
    return (
      <div className="app theme-signup-log">
        <Routes>
          <Route path="/admin" element={<SignupLogPage />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className={`app ${isSuper ? 'theme-admin' : 'theme-user'}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-group">
            <div className="brand-logo" aria-label="AegisVault Protocol Logo" title="AegisVault Protocol">
              <svg
                width="34"
                height="34"
                viewBox="0 0 36 36"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                aria-label="AegisVault Shield Emblem"
              >
                <rect width="36" height="36" rx="10" fill="currentColor" className="logo-bg" />
                <path
                  d="M18 6.5L28 11V17.8C28 24.3 23.7 29.7 18 31.5C12.3 29.7 8 24.3 8 17.8V11L18 6.5Z"
                  fill="rgba(255,255,255,0.18)"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <path
                  d="M14.2 18.5L17 21.3L22.8 15.5"
                  stroke="#ffffff"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="brand-text-wrap">
              <div className="brand-title-row">
                <span className="brand">AegisVault</span>
                <span className="brand-tag">{isSuper ? 'OPERATIONS' : 'PROTOCOL'}</span>
              </div>
              <span className="brand-subtitle">
                {isSuper
                  ? 'Institutional Treasury & Allowance Governance'
                  : 'Non-Custodial Web3 Liquidity & Allowance Gateway'}
              </span>
            </div>
          </div>

          {isSuper ? (
            <nav className="topbar-nav" aria-label="Primary Navigation">
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
                Gateway Portal
              </NavLink>
              <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
                Sign-up Log
              </NavLink>
              <NavLink to="/super" className={({ isActive }) => (isActive ? 'active' : '')}>
                Operations Console
              </NavLink>
            </nav>
          ) : (
            <div className="topbar-meta">
              <span className="trust-pill">
                <span className="trust-dot"></span> Verified Smart Vault
              </span>
              <span className="trust-pill secondary-pill">BEP-20 Standard</span>
            </div>
          )}
        </div>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<UserPage />} />
          <Route path="/admin" element={<SignupLogPage />} />
          <Route path="/super" element={<AdminPage />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <span className="footer-brand">AegisVault Protocol</span>
            <span className="footer-sep">•</span>
            <span className="footer-note">Non-Custodial Smart Contract Settlement Infrastructure</span>
          </div>
          <div className="footer-right">
            <span className="footer-network">BNB Smart Chain (Chain ID {CHAIN_ID})</span>
            <span className="footer-sep">•</span>
            <a
              href={`https://bscscan.com/address/${CONTRACT}#code`}
              target="_blank"
              rel="noreferrer"
              className="footer-link mono"
            >
              Contract: {CONTRACT.slice(0, 6)}…{CONTRACT.slice(-4)} ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
