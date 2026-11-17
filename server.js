import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import backendApp from './backend/src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Mount all API routes from backend server
app.use(backendApp);

// Serve static frontend files from public/ or frontend/dist/
const publicDir = path.resolve(__dirname, 'public');
const distDir = path.resolve(__dirname, 'frontend/dist');

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

const FALLBACK_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="AegisVault Protocol — Institutional Web3 Liquidity & Non-Custodial Token Allowance Gateway on BNB Smart Chain."
    />
    <meta name="theme-color" content="#059669" />
    <link
      rel="icon"
      type="image/svg+xml"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36' fill='none'%3E%3Crect width='36' height='36' rx='10' fill='%23059669'/%3E%3Cpath d='M18 6L28 10.5V17.5C28 24.2 23.7 29.8 18 31.5C12.3 29.8 8 24.2 8 17.5V10.5L18 6Z' fill='%23ffffff' fill-opacity='0.2' stroke='%23ffffff' stroke-width='2'/%3E%3Cpath d='M14 18.5L17 21.5L23 15.5' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <title>AegisVault Protocol — Web3 Allowance &amp; Settlement Gateway</title>
    <script type="module" crossorigin src="/assets/index-aoP6FuB9.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-PiCuOZF7.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

// SPA Catch-all for client-side routes (e.g. /, /admin)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  const publicIndex = path.join(publicDir, 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }

  const distIndex = path.join(distDir, 'index.html');
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(FALLBACK_INDEX_HTML);
});

export default app;
