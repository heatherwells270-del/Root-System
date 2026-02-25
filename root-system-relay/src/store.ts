// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM RELAY — Store
//
// SQLite persistence layer. The relay stores only what it must:
//   - Community registry (id + planter public key)
//   - Used nonces (replay attack prevention, 5-min TTL)
//   - Post buffer (encrypted blobs, 48-hour TTL; relay cannot read them)
//   - Key request queue (when planter is offline, held for 7 days)
//
// Nothing here contains plaintext post content. The relay is a blind router.
//
// Uses node:sqlite — built into Node.js 22.5+ (no native compilation needed).
// ═══════════════════════════════════════════════════════════════════════════

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env['DB_PATH'] ?? path.join(__dirname, '..', 'relay.db');

let db: DatabaseSync;

// ─── INIT ────────────────────────────────────────────────────────────────────

export function initDb(): void {
  db = new DatabaseSync(DB_PATH);

  // WAL mode: better concurrent read performance
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`

  -- ─── COMMUNITIES ─────────────────────────────────────────────────────────
  -- Community registry. Created when the first planter arrives.
  -- The relay doesn't validate or moderate — it records that a community exists.
  CREATE TABLE IF NOT EXISTS communities (
    id                  TEXT    PRIMARY KEY,
    planter_public_key  TEXT    NOT NULL,
    created_at          TEXT    NOT NULL
  );

  -- ─── NONCES ──────────────────────────────────────────────────────────────
  -- Challenge nonces handed out during auth. Single-use. TTL: 5 minutes.
  -- Prevents replay attacks: if you intercept an auth exchange, the nonce
  -- is already burned before you can use it.
  CREATE TABLE IF NOT EXISTS nonces (
    nonce     TEXT PRIMARY KEY,
    issued_at TEXT NOT NULL
  );

  -- ─── POST BUFFER ─────────────────────────────────────────────────────────
  -- Encrypted post blobs held for 48 hours.
  -- The relay cannot read these — they're AES-256-GCM encrypted with the
  -- community key, which the relay never holds.
  -- A device pushes a post → relay stores the ciphertext → other devices pull
  -- → relay deletes on ack.
  CREATE TABLE IF NOT EXISTS post_buffer (
    id            TEXT    PRIMARY KEY,
    community_id  TEXT    NOT NULL,
    encrypted_blob TEXT   NOT NULL,
    pushed_at     TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_buffer_community ON post_buffer(community_id);
  CREATE INDEX IF NOT EXISTS idx_buffer_pushed    ON post_buffer(pushed_at);

  -- ─── KEY REQUEST QUEUE ────────────────────────────────────────────────────
  -- When a new member requests the community key and the planter is offline,
  -- the request is queued here. When the planter reconnects, it gets the
  -- pending requests and can approve/deny each one.
  -- TTL: 7 days. After that, the device can re-request.
  CREATE TABLE IF NOT EXISTS key_request_queue (
    community_id        TEXT    NOT NULL,
    requester_public_key TEXT   NOT NULL,
    requested_at        TEXT    NOT NULL,
    PRIMARY KEY (community_id, requester_public_key)
  );

  `);
}

// ─── COMMUNITIES ─────────────────────────────────────────────────────────────

export function registerCommunity(id: string, planterPublicKey: string): void {
  db.prepare(`
    INSERT INTO communities (id, planter_public_key, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(id, planterPublicKey, new Date().toISOString());
}

export function getCommunity(id: string): { planterPublicKey: string } | null {
  const row = db.prepare(
    'SELECT planter_public_key FROM communities WHERE id = ?'
  ).get(id) as { planter_public_key: string } | undefined;
  return row ? { planterPublicKey: row.planter_public_key } : null;
}

// ─── NONCES ──────────────────────────────────────────────────────────────────

export function issueNonce(nonce: string): void {
  db.prepare('INSERT INTO nonces (nonce, issued_at) VALUES (?, ?)')
    .run(nonce, new Date().toISOString());
}

export function consumeNonce(nonce: string): boolean {
  // Returns true if the nonce exists and is within 5-minute window
  const row = db.prepare('SELECT issued_at FROM nonces WHERE nonce = ?')
    .get(nonce) as { issued_at: string } | undefined;
  if (!row) return false;

  const age = Date.now() - new Date(row.issued_at).getTime();
  if (age > 5 * 60 * 1000) return false;  // expired

  // Burn it — nonces are single-use
  db.prepare('DELETE FROM nonces WHERE nonce = ?').run(nonce);
  return true;
}

export function cleanNonces(): void {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM nonces WHERE issued_at < ?').run(cutoff);
}

// ─── POST BUFFER ─────────────────────────────────────────────────────────────

export function pushBuffer(
  id: string,
  communityId: string,
  encryptedBlob: string,
  pushedAt: string
): void {
  db.prepare(`
    INSERT INTO post_buffer (id, community_id, encrypted_blob, pushed_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(id, communityId, encryptedBlob, pushedAt);
}

export function pullBuffer(
  communityId: string,
  since: string
): Array<{ id: string; encryptedBlob: string; pushedAt: string }> {
  return (db.prepare(`
    SELECT id, encrypted_blob, pushed_at
    FROM post_buffer
    WHERE community_id = ? AND pushed_at > ?
    ORDER BY pushed_at ASC
  `).all(communityId, since) as Array<{
    id: string; encrypted_blob: string; pushed_at: string;
  }>).map(r => ({ id: r.id, encryptedBlob: r.encrypted_blob, pushedAt: r.pushed_at }));
}

export function ackBuffer(bufferId: string): void {
  db.prepare('DELETE FROM post_buffer WHERE id = ?').run(bufferId);
}

export function cleanBuffer(): void {
  // Delete items older than 48 hours
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM post_buffer WHERE pushed_at < ?').run(cutoff);
}

// ─── KEY REQUEST QUEUE ────────────────────────────────────────────────────────

export function enqueueKeyRequest(communityId: string, requesterPublicKey: string): void {
  db.prepare(`
    INSERT INTO key_request_queue (community_id, requester_public_key, requested_at)
    VALUES (?, ?, ?)
    ON CONFLICT(community_id, requester_public_key) DO UPDATE SET
      requested_at = excluded.requested_at
  `).run(communityId, requesterPublicKey, new Date().toISOString());
}

export function getPendingKeyRequests(
  communityId: string
): Array<{ requesterPublicKey: string; requestedAt: string }> {
  return (db.prepare(`
    SELECT requester_public_key, requested_at
    FROM key_request_queue
    WHERE community_id = ?
    ORDER BY requested_at ASC
  `).all(communityId) as Array<{
    requester_public_key: string; requested_at: string;
  }>).map(r => ({
    requesterPublicKey: r.requester_public_key,
    requestedAt: r.requested_at,
  }));
}

export function clearKeyRequest(communityId: string, requesterPublicKey: string): void {
  db.prepare(`
    DELETE FROM key_request_queue
    WHERE community_id = ? AND requester_public_key = ?
  `).run(communityId, requesterPublicKey);
}

export function cleanKeyRequests(): void {
  // Expire requests older than 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM key_request_queue WHERE requested_at < ?').run(cutoff);
}

export { db };
