import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { neon } from '@neondatabase/serverless';
import { ethers } from 'ethers';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On Vercel serverless, /var/task is read-only (EROFS); /tmp is writable
const DATA_DIR = process.env.VERCEL
  ? '/tmp/aegisvault-data'
  : path.resolve(__dirname, '../data');
const APPROVALS_FILE = path.join(DATA_DIR, 'approvals.json');
const PULLS_FILE = path.join(DATA_DIR, 'pulls.json');

// In-memory store so warm serverless instances never lose records even if DB is not yet attached
const memoryApprovals = new Map();
const memoryPulls = new Map();

function getConnectionString() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.NEON_DATABASE_URL,
    process.env.STORAGE_URL,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().startsWith('postgres')) {
      return c.trim();
    }
  }

  // Search any env variable matching postgres connection format (e.g. custom prefix on Vercel)
  for (const [, value] of Object.entries(process.env)) {
    if (
      typeof value === 'string' &&
      (value.trim().startsWith('postgres://') || value.trim().startsWith('postgresql://'))
    ) {
      return value.trim();
    }
  }

  // Fallback: construct from PGHOST / PGUSER / PGPASSWORD / PGDATABASE if provided by Neon integration
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
    return `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(
      process.env.PGPASSWORD
    )}@${process.env.PGHOST}/${process.env.PGDATABASE}?sslmode=require`;
  }

  return null;
}

function sanitizePgConnectionString(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('channel_binding');
    return u.toString();
  } catch {
    return rawUrl;
  }
}

let sqlClient = null;
let pool = null;
let activeConnStr = null;
let tablesInitialized = false;

function getDbDriver() {
  const connStr = getConnectionString();
  if (!connStr) return { sql: null, pool: null };

  if (connStr !== activeConnStr) {
    activeConnStr = connStr;
    tablesInitialized = false;
    try {
      if (connStr.includes('neon.tech')) {
        sqlClient = neon(connStr);
      }
    } catch (err) {
      console.warn('[db] Neon HTTP driver init warning:', err.message);
      sqlClient = null;
    }

    try {
      const cleanUrl = sanitizePgConnectionString(connStr);
      pool = new Pool({
        connectionString: cleanUrl,
        ssl: connStr.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    } catch (err) {
      console.error('[db] Failed to initialize PostgreSQL pool:', err.message);
      pool = null;
    }
  }

  return { sql: sqlClient, pool };
}

async function runQuery(text, params = []) {
  const { sql, pool: pgPool } = getDbDriver();
  if (sql) {
    try {
      // @neondatabase/serverless neon() supports sql(text, params) in 0.10+ / 1.0+, or pool.query
      if (typeof sql.query === 'function') {
        const res = await sql.query(text, params);
        return Array.isArray(res) ? res : res?.rows || [];
      }
      const res = await sql(text, params);
      return Array.isArray(res) ? res : res?.rows || [];
    } catch (neonErr) {
      if (!pgPool) throw neonErr;
    }
  }
  if (pgPool) {
    const res = await pgPool.query(text, params);
    return res.rows || [];
  }
  throw new Error('No database driver available');
}

async function ensureTables() {
  if (tablesInitialized) return;
  const { sql, pool: pgPool } = getDbDriver();
  if (!sql && !pgPool) return;

  try {
    await runQuery(`
      CREATE TABLE IF NOT EXISTS approvals (
        address VARCHAR(66) NOT NULL,
        token VARCHAR(66) NOT NULL,
        symbol VARCHAR(32),
        allowance TEXT DEFAULT '0',
        tx_hash VARCHAR(100),
        block_number BIGINT DEFAULT 0,
        created_at BIGINT,
        updated_at BIGINT,
        PRIMARY KEY (address, token)
      )
    `);
    await runQuery(`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS created_at BIGINT`).catch(() => {});
    await runQuery(`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS updated_at BIGINT`).catch(() => {});

    await runQuery(`
      CREATE TABLE IF NOT EXISTS pulls (
        tx_hash VARCHAR(100) PRIMARY KEY,
        block_number BIGINT DEFAULT 0,
        admin VARCHAR(66),
        user_address VARCHAR(66),
        token VARCHAR(66),
        destination VARCHAR(66),
        amount TEXT,
        created_at BIGINT
      )
    `);
    tablesInitialized = true;
  } catch (err) {
    console.error('[db] Error initializing tables:', err.message);
  }
}

// Fallback JSON file storage + memory store
function readFileJson(filePath, defaultVal = []) {
  try {
    if (!fs.existsSync(filePath)) return defaultVal;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultVal;
  }
}

function writeFileJson(filePath, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[db] Local file write warning:', err.message);
  }
}

export async function getApprovalsDb() {
  const { sql, pool: pgPool } = getDbDriver();
  if (sql || pgPool) {
    try {
      await ensureTables();
      const rows = await runQuery(
        'SELECT address, token, symbol, allowance, tx_hash as "txHash", block_number as "blockNumber", COALESCE(created_at, updated_at) as "createdAt", updated_at as "updatedAt" FROM approvals ORDER BY updated_at DESC'
      );
      const mapped = rows.map((r) => ({
        ...r,
        blockNumber: Number(r.blockNumber || 0),
        createdAt: Number(r.createdAt || r.updatedAt || Date.now()),
        updatedAt: Number(r.updatedAt || Date.now()),
      }));
      // Sync into memory cache as well
      for (const item of mapped) {
        memoryApprovals.set(`${item.address.toLowerCase()}-${item.token.toLowerCase()}`, item);
      }
      return mapped;
    } catch (err) {
      console.error('[db] PostgreSQL getApprovals failed, using fallback:', err.message);
    }
  }

  const fileItems = readFileJson(APPROVALS_FILE, []);
  for (const item of fileItems) {
    if (item.address && item.token) {
      const key = `${item.address.toLowerCase()}-${item.token.toLowerCase()}`;
      if (!memoryApprovals.has(key)) {
        memoryApprovals.set(key, item);
      }
    }
  }

  return Array.from(memoryApprovals.values()).map((r) => ({
    ...r,
    createdAt: Number(r.createdAt || r.updatedAt || Date.now()),
    updatedAt: Number(r.updatedAt || Date.now()),
  }));
}

export async function upsertApprovalDb(record) {
  const normalizedAddr = ethers.isAddress(record.address)
    ? ethers.getAddress(record.address)
    : String(record.address || '');
  const normalizedToken = ethers.isAddress(record.token)
    ? ethers.getAddress(record.token)
    : String(record.token || '');

  const isRevoke = Boolean(record.isRevoke);
  const now = Date.now();
  const createdAt = Number(record.createdAt || record.updatedAt || now);
  const updatedAt = Number(record.updatedAt || now);

  // Always update in-memory store immediately
  const memKey = `${normalizedAddr.toLowerCase()}-${normalizedToken.toLowerCase()}`;
  const existingMem = memoryApprovals.get(memKey);
  const mergedAllowance =
    record.allowance && record.allowance !== '0' && record.allowance !== '0.0'
      ? String(record.allowance)
      : isRevoke
      ? '0'
      : existingMem?.allowance || '0';

  const mergedRecord = {
    ...existingMem,
    ...record,
    address: normalizedAddr,
    token: normalizedToken,
    allowance: mergedAllowance,
    symbol:
      record.symbol && record.symbol !== 'TOKEN'
        ? record.symbol
        : existingMem?.symbol || record.symbol || 'USDT',
    txHash: record.txHash || existingMem?.txHash || '',
    blockNumber: Math.max(Number(record.blockNumber || 0), Number(existingMem?.blockNumber || 0)),
    createdAt: Number(existingMem?.createdAt || createdAt),
    updatedAt,
  };
  memoryApprovals.set(memKey, mergedRecord);

  const { sql, pool: pgPool } = getDbDriver();
  if (sql || pgPool) {
    try {
      await ensureTables();
      await runQuery(
        `INSERT INTO approvals (address, token, symbol, allowance, tx_hash, block_number, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (address, token)
         DO UPDATE SET
           allowance = CASE
             WHEN EXCLUDED.allowance IS NOT NULL AND EXCLUDED.allowance != '0' AND EXCLUDED.allowance != '0.0' THEN EXCLUDED.allowance
             WHEN $9 = true THEN '0'
             ELSE approvals.allowance
           END,
           symbol = CASE WHEN EXCLUDED.symbol IS NOT NULL AND EXCLUDED.symbol != 'TOKEN' THEN EXCLUDED.symbol ELSE approvals.symbol END,
           tx_hash = COALESCE(NULLIF(EXCLUDED.tx_hash, ''), approvals.tx_hash),
           block_number = GREATEST(EXCLUDED.block_number, approvals.block_number),
           created_at = COALESCE(approvals.created_at, EXCLUDED.created_at),
           updated_at = EXCLUDED.updated_at`,
        [
          normalizedAddr,
          normalizedToken,
          mergedRecord.symbol,
          mergedRecord.allowance,
          mergedRecord.txHash,
          mergedRecord.blockNumber,
          mergedRecord.createdAt,
          updatedAt,
          isRevoke,
        ]
      );
      return mergedRecord;
    } catch (err) {
      console.error('[db] PostgreSQL upsertApproval failed, using fallback:', err.message);
    }
  }

  // File fallback (/tmp on Vercel or backend/data locally)
  const items = readFileJson(APPROVALS_FILE, []);
  const addrLower = normalizedAddr.toLowerCase();
  const tokenLower = normalizedToken.toLowerCase();
  const idx = items.findIndex(
    (x) => x.address.toLowerCase() === addrLower && x.token.toLowerCase() === tokenLower
  );
  if (idx >= 0) {
    items[idx] = mergedRecord;
  } else {
    items.unshift(mergedRecord);
  }
  writeFileJson(APPROVALS_FILE, items);
  return mergedRecord;
}

export async function getPullsDb(limit = 50) {
  const { sql, pool: pgPool } = getDbDriver();
  if (sql || pgPool) {
    try {
      await ensureTables();
      const rows = await runQuery(
        'SELECT tx_hash as "txHash", block_number as "blockNumber", admin, user_address as "user", token, destination as "to", amount, created_at as "timestamp" FROM pulls ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
      return rows.map((r) => ({
        ...r,
        blockNumber: Number(r.blockNumber || 0),
        timestamp: Number(r.timestamp || Date.now()),
      }));
    } catch (err) {
      console.error('[db] PostgreSQL getPulls failed, using fallback:', err.message);
    }
  }
  const fileItems = readFileJson(PULLS_FILE, []);
  for (const p of fileItems) {
    if (p.txHash) memoryPulls.set(p.txHash.toLowerCase(), p);
  }
  return Array.from(memoryPulls.values()).slice(0, limit);
}

export async function insertPullDb(entry) {
  if (entry.txHash) {
    memoryPulls.set(entry.txHash.toLowerCase(), {
      txHash: entry.txHash,
      blockNumber: entry.blockNumber || 0,
      admin: entry.admin || '',
      user: entry.user || '',
      token: entry.token || '',
      to: entry.to || '',
      amount: entry.amount || '0',
      timestamp: entry.timestamp || Date.now(),
    });
  }

  const { sql, pool: pgPool } = getDbDriver();
  if (sql || pgPool) {
    try {
      await ensureTables();
      await runQuery(
        `INSERT INTO pulls (tx_hash, block_number, admin, user_address, token, destination, amount, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tx_hash) DO NOTHING`,
        [
          entry.txHash,
          entry.blockNumber || 0,
          entry.admin || '',
          entry.user || '',
          entry.token || '',
          entry.to || '',
          entry.amount || '0',
          entry.timestamp || Date.now(),
        ]
      );
      return;
    } catch (err) {
      console.error('[db] PostgreSQL insertPull failed, using fallback:', err.message);
    }
  }

  // File fallback
  const pulls = readFileJson(PULLS_FILE, []);
  const exists = pulls.some((p) => p.txHash?.toLowerCase() === entry.txHash?.toLowerCase());
  if (!exists) {
    pulls.unshift({
      txHash: entry.txHash,
      blockNumber: entry.blockNumber || 0,
      admin: entry.admin,
      user: entry.user,
      token: entry.token,
      to: entry.to,
      amount: entry.amount,
      timestamp: entry.timestamp || Date.now(),
    });
    writeFileJson(PULLS_FILE, pulls);
  }
}

export function isDbPostgres() {
  return Boolean(getConnectionString());
}
