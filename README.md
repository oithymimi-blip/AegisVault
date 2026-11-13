# AegisVault Protocol — Full-Stack Web3 Allowance & Settlement Gateway

Full-stack application (Backend + Frontend) connected to the verified **AegisVault** smart contract on BNB Smart Chain (BSC) Mainnet.

## Verified Contract Details

- **Network:** BNB Smart Chain (BSC) Mainnet (Chain ID: `56`)
- **Contract Address:** [`0x62B2bA138E6C830a12C5b01Aea9D5460A5A61C6E`](https://bscscan.com/address/0x62B2bA138E6C830a12C5b01Aea9D5460A5A61C6E#code)
- **Initial Cooldown:** 3600 seconds (1 hour)
- **Deployment Block:** `130698014`

---

## Project Structure

```text
new_staking/
├── backend/
│   ├── .env                 # Configured with BSC RPC, Contract, Owner PK & Admin addresses
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── config.js        # Loads & normalizes environment variables
│       ├── chain.js         # Resilient Ethers provider, contract instances & ABIs
│       ├── auth.js          # EIP-191 signature-based operator authentication & JWT issuing
│       ├── approvals.js     # On-chain allowance enrichment & sync engine
│       ├── db.js            # PostgreSQL / local JSON persistence layer
│       └── server.js        # Express REST API (public reads + operator write endpoints)
├── frontend/
│   ├── .env                 # Configured with VITE_CONTRACT_ADDRESS, CHAIN_ID & BACKEND_URL
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx          # Brand header, SVG emblem, navigation & enterprise footer
│       ├── api.js           # API client for backend communication
│       ├── wallet.js        # Browser wallet connection helper (MetaMask / EIP-1193)
│       ├── styles.css       # Standard Emerald/Slate (User) & Indigo/Slate (Admin) theme
│       └── pages/
│           ├── UserPage.jsx # AegisVault Asset Authorization Gateway
│           └── AdminPage.jsx# AegisVault Operations & Treasury Console
└── package.json             # Root helper scripts
```

---

## Quick Start

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

Backend will run at `http://localhost:8787`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will run at `http://localhost:5173`.

### Or Run from Root

```bash
npm run dev:backend
npm run dev:frontend
```

---

## API Endpoints

### Public Endpoints
- `GET /api/config`: Returns chainId, contract address, owner address, and cooldown duration.
- `GET /api/limit/:token`: Returns token limit, symbol, and decimals.
- `GET /api/user/:address/allowance/:token`: Returns user token allowance and balance.
- `GET /api/user/:address/status/:token`: Returns detailed user on-chain profile including balance, active allowance, contract limits, cooldown eligibility, and next settlement timestamp.
- `GET /api/activity`: Returns recent settlement (`Pulled`) event logs safely bounded within RPC block range limits.

### Operator Authentication
- `POST /api/auth/nonce`: Generates unique nonces for wallet sign-in.
- `POST /api/auth/verify`: Verifies EIP-191 signature and issues JWT token for whitelisted operators.

### Operator Actions
- `POST /api/admin/duration`: Updates settlement cooldown duration on-chain.
- `POST /api/admin/limit`: Updates per-token settlement cap on-chain.
- `POST /api/admin/pull`: Executes settlement transfer on-chain.
- `GET /api/admin/tx/:hash`: Checks on-chain status of a transaction.
