import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export default function SignupLogPage() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      const res = await api.signupLog();
      setLogs(res.items || []);
    } catch (e) {
      console.error('Failed to load wallet sign-up log:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    const timer = setInterval(loadLogs, 10_000);
    return () => clearInterval(timer);
  }, [loadLogs]);

  const query = search.trim().toLowerCase();
  const filteredLogs = query
    ? logs.filter(
        (item) =>
          String(item.address || '').toLowerCase().includes(query) ||
          String(item.referralTag || '').toLowerCase().includes(query) ||
          String(item.referredBy || '').toLowerCase().includes(query) ||
          String(item.serial || '').includes(query)
      )
    : logs;

  return (
    <div className="signup-log-wrapper">
      <div className="signup-log-container">
        <h1 className="signup-log-title">Wallet Sign-up Log</h1>
        <p className="signup-log-subtitle">
          Compact view of when a wallet joined, its referral tag, and who referred it — stored permanently.
        </p>

        <div className="signup-log-search-row">
          <input
            type="text"
            className="signup-log-search"
            placeholder="Search address or referral tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search address or referral tag"
          />
        </div>

        <div className="signup-log-table-card">
          <table className="signup-log-table">
            <thead>
              <tr>
                <th className="col-serial">#</th>
                <th className="col-date">DATE</th>
                <th className="col-address">ADDRESS</th>
                <th className="col-tag">REFERRAL TAG</th>
                <th className="col-referred">REFERRED BY</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="signup-log-empty">
                    Loading wallet sign-up log…
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="signup-log-empty">
                    No matching wallet records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((row) => (
                  <tr key={`${row.serial}-${row.address}-${row.timestamp}`}>
                    <td className="cell-serial">{row.serial}</td>
                    <td className="cell-date">{formatLogDate(row.timestamp)}</td>
                    <td className="cell-address">{row.address}</td>
                    <td className="cell-tag">
                      <span className="referral-tag-pill">{row.referralTag}</span>
                    </td>
                    <td className="cell-referred">{row.referredBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatLogDate(ts) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
