import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory and project root directory (local dev)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function normalizePrivateKey(rawKey) {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

export const config = {
  port: Number(process.env.PORT || 8787),
  rpcUrl: process.env.RPC_URL || 'https://bsc-dataseed.binance.org',
  chainId: Number(process.env.CHAIN_ID || 56),
  contractAddress:
    process.env.CONTRACT_ADDRESS || '0x62B2bA138E6C830a12C5b01Aea9D5460A5A61C6E',
  ownerPrivateKey: normalizePrivateKey(process.env.OWNER_PRIVATE_KEY),
  adminAddresses: (process.env.ADMIN_ADDRESSES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || 'aegisvault-jwt-secret-key-32chars-min',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  fromBlock: Number(process.env.FROM_BLOCK || 0),
};
