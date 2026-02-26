// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM RELAY — Server Entry Point
//
// What this relay does:
//   - Authenticates devices via Ed25519 challenge-response
//   - Tracks which devices are in which community (ephemeral, in-memory)
//   - Brokers WebRTC signaling so devices can connect directly
//   - Holds an encrypted post buffer for up to 48 hours
//   - Queues community key requests when the planter is offline
//
// What this relay does NOT do:
//   - Read post content (it's AES-256-GCM encrypted, relay holds ciphertext)
//   - Store identity data beyond the public key
//   - Log user activity
//   - Make any editorial decisions
//   - Store messages between devices (only the encrypted buffer)
//
// Production deployment:
//   - Run behind nginx or Caddy for TLS (WSS requires HTTPS)
//   - Set PORT env var (default 8080)
//   - Set DB_PATH env var for SQLite file location (default ./relay.db)
//   - Set ALLOWED_ORIGIN env var (comma-separated) for CORS if needed
//   - The relay process is stateless except for relay.db — restart safely
// ═══════════════════════════════════════════════════════════════════════════

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import {
  initDb, cleanNonces, cleanBuffer, cleanKeyRequests,
  cleanContactRequests, cleanContactResponses,
} from './store.js';
import {
  onConnect, onDisconnect, onMessage, sessions,
} from './handlers.js';

const PORT = parseInt(process.env['PORT'] ?? '8080', 10);

// ─── INIT ────────────────────────────────────────────────────────────────────

initDb();
console.log(`[relay] database ready`);

// ─── HTTP SERVER ─────────────────────────────────────────────────────────────
// The HTTP server only serves a health check. All real traffic is WebSocket.

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ─── WEBSOCKET SERVER ─────────────────────────────────────────────────────────

// maxPayload: 128 KB — well above any legitimate message.
// Rejects oversized frames before any application code runs,
// protecting against memory exhaustion via malformed WebSocket frames.
const wss = new WebSocketServer({ server: httpServer, maxPayload: 128 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  const session = onConnect(ws);

  ws.on('message', async (data) => {
    try {
      await onMessage(session, data.toString());
    } catch (err) {
      console.error(`[error] session=${session.sessionId}`, err);
    }
  });

  ws.on('close', () => {
    onDisconnect(session);
  });

  ws.on('error', (err) => {
    console.error(`[ws-error] session=${session.sessionId}`, err);
  });
});

wss.on('error', (err) => {
  console.error('[wss-error]', err);
});

// ─── CLEANUP INTERVALS ────────────────────────────────────────────────────────
// Keep the database lean. None of this data is precious — it's all ephemeral.

// Every 5 minutes: clean expired nonces
setInterval(() => {
  cleanNonces();
}, 5 * 60 * 1000);

// Every hour: clean buffer items older than 48 hours
setInterval(() => {
  cleanBuffer();
}, 60 * 60 * 1000);

// Every 6 hours: clean key requests older than 7 days
setInterval(() => {
  cleanKeyRequests();
}, 6 * 60 * 60 * 1000);

// Every 6 hours: clean contact requests older than 7 days
setInterval(() => {
  cleanContactRequests();
}, 6 * 60 * 60 * 1000);

// Every 12 hours: clean contact responses older than 48 hours
setInterval(() => {
  cleanContactResponses();
}, 12 * 60 * 60 * 1000);

// Every 12 hours: close sessions authenticated > 24 hours ago.
// Forces re-auth to prevent stale sessions from accumulating indefinitely.
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let closed = 0;
  for (const [, session] of sessions) {
    if (session.authedAt && session.authedAt < cutoff) {
      session.ws.close();
      closed++;
    }
  }
  if (closed > 0) {
    console.log(`[session-timeout] closed ${closed} stale session(s)`);
  }
}, 12 * 60 * 60 * 1000);

// ─── START ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[relay] listening on ws://localhost:${PORT}`);
  console.log(`[relay] health check: http://localhost:${PORT}/health`);
  console.log(`[relay] protocol version: 1`);
});

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`[relay] ${signal} received — shutting down`);
  wss.close(() => {
    httpServer.close(() => {
      console.log('[relay] stopped');
      process.exit(0);
    });
  });
  // Force exit after 5 seconds if graceful shutdown stalls
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
