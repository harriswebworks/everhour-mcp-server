// auth-proxy.js
// Spawns supergateway as a child process on an internal port, exposes a
// public Express server that requires Bearer token auth before proxying
// requests through. Used as the container CMD.

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '8080', 10);
const INTERNAL_PORT = 3001;
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('[auth-proxy] FATAL: AUTH_TOKEN env var is required');
  process.exit(1);
}

if (AUTH_TOKEN.length < 16) {
  console.error('[auth-proxy] FATAL: AUTH_TOKEN must be at least 16 chars');
  process.exit(1);
}

console.log(`[auth-proxy] Starting supergateway on internal port ${INTERNAL_PORT}`);

const supergateway = spawn(
  'supergateway',
  [
    '--stdio', 'node build/index.js',
    '--outputTransport', 'streamableHttp',
    '--port', String(INTERNAL_PORT),
  ],
  {
    env: process.env,
    stdio: 'inherit',
  }
);

supergateway.on('exit', (code, signal) => {
  console.error(`[auth-proxy] supergateway exited code=${code} signal=${signal}`);
  process.exit(code || 1);
});

// Give supergateway a moment to bind its port before we accept traffic
setTimeout(() => {
  const app = express();

  // Unauthenticated health check for Railway / uptime pings
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Auth gate
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const expected = `Bearer ${AUTH_TOKEN}`;
    if (authHeader !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  // Proxy authenticated requests to supergateway
  const proxy = createProxyMiddleware({
    target: `http://127.0.0.1:${INTERNAL_PORT}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    onError: (err, req, res) => {
      console.error('[auth-proxy] proxy error:', err.message);
      if (res && !res.headersSent) {
        res.status(502).json({ error: 'Bad Gateway' });
      }
    },
  });

  app.use(proxy);

  const server = app.listen(PORT, () => {
    console.log(`[auth-proxy] listening on ${PORT}, forwarding authed requests to ${INTERNAL_PORT}`);
  });

  // Forward WebSocket upgrades through the proxy as well
  server.on('upgrade', proxy.upgrade);
}, 3000);
