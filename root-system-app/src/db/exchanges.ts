// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Exchange Queries
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { Exchange, ExchangeStatus } from '../models/types';

interface ExchangeRow {
  id: string; community_id: string;
  from_public_key: string; to_public_key: string;
  from_handle: string; to_handle: string;
  hours: number; description: string; emoji: string | null;
  confirmed_by_from: number; confirmed_by_to: number;
  status: string; created_at: string; expires_at: string;
  confirmed_at: string | null; sig: string; version: number; updated_at: string;
}

function rowToExchange(r: ExchangeRow): Exchange {
  return {
    id: r.id, communityId: r.community_id,
    fromPublicKey: r.from_public_key, toPublicKey: r.to_public_key,
    fromHandle: r.from_handle, toHandle: r.to_handle,
    hours: r.hours, description: r.description, emoji: r.emoji,
    confirmedByFrom: r.confirmed_by_from === 1,
    confirmedByTo: r.confirmed_by_to === 1,
    status: r.status as ExchangeStatus,
    createdAt: r.created_at, expiresAt: r.expires_at,
    confirmedAt: r.confirmed_at,
    _sig: r.sig, _version: r.version, _updatedAt: r.updated_at,
  };
}

// ─── READS ──────────────────────────────────────────────────────────────────

export async function getExchangesForKey(publicKey: string): Promise<Exchange[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ExchangeRow>(
    `SELECT * FROM exchanges
     WHERE from_public_key = ? OR to_public_key = ?
     ORDER BY created_at DESC`,
    [publicKey, publicKey]
  );
  return rows.map(rowToExchange);
}

export async function getExchange(id: string): Promise<Exchange | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ExchangeRow>(
    'SELECT * FROM exchanges WHERE id = ?', [id]
  );
  return row ? rowToExchange(row) : null;
}

/**
 * Time bank balance for a public key.
 * Derived from all confirmed exchanges — never stored as a single number.
 * Cannot be manipulated without forging confirmed exchange records.
 */
export async function getTimebankBalance(publicKey: string): Promise<number> {
  const db = await getDb();
  const earned = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(hours), 0) as total FROM exchanges
     WHERE to_public_key = ? AND status = 'confirmed'`,
    [publicKey]
  );
  const spent = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(hours), 0) as total FROM exchanges
     WHERE from_public_key = ? AND status = 'confirmed'`,
    [publicKey]
  );
  return (earned?.total ?? 0) - (spent?.total ?? 0);
}

// ─── WRITES ─────────────────────────────────────────────────────────────────

export async function upsertExchange(exchange: Exchange): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exchanges (
       id, community_id, from_public_key, to_public_key,
       from_handle, to_handle, hours, description, emoji,
       confirmed_by_from, confirmed_by_to, status,
       created_at, expires_at, confirmed_at,
       sig, version, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       confirmed_by_from = CASE WHEN excluded.version > exchanges.version THEN excluded.confirmed_by_from ELSE exchanges.confirmed_by_from END,
       confirmed_by_to   = CASE WHEN excluded.version > exchanges.version THEN excluded.confirmed_by_to   ELSE exchanges.confirmed_by_to   END,
       status            = CASE WHEN excluded.version > exchanges.version THEN excluded.status            ELSE exchanges.status            END,
       confirmed_at      = CASE WHEN excluded.version > exchanges.version THEN excluded.confirmed_at      ELSE exchanges.confirmed_at      END,
       version           = MAX(exchanges.version, excluded.version),
       updated_at        = CASE WHEN excluded.version > exchanges.version THEN excluded.updated_at        ELSE exchanges.updated_at        END`,
    [
      exchange.id, exchange.communityId,
      exchange.fromPublicKey, exchange.toPublicKey,
      exchange.fromHandle, exchange.toHandle,
      exchange.hours, exchange.description, exchange.emoji ?? null,
      exchange.confirmedByFrom ? 1 : 0, exchange.confirmedByTo ? 1 : 0,
      exchange.status, exchange.createdAt, exchange.expiresAt,
      exchange.confirmedAt ?? null,
      exchange._sig, exchange._version, exchange._updatedAt,
    ]
  );
}

export async function confirmExchange(id: string, byPublicKey: string): Promise<void> {
  const db = await getDb();
  const ex = await getExchange(id);
  if (!ex || ex.status !== 'pending') return;

  const isFrom = ex.fromPublicKey === byPublicKey;
  const isTo   = ex.toPublicKey   === byPublicKey;
  if (!isFrom && !isTo) return;

  const newConfirmedFrom = isFrom ? 1 : (ex.confirmedByFrom ? 1 : 0);
  const newConfirmedTo   = isTo   ? 1 : (ex.confirmedByTo   ? 1 : 0);
  const bothConfirmed    = newConfirmedFrom === 1 && newConfirmedTo === 1;
  const now              = new Date().toISOString();

  await db.runAsync(
    `UPDATE exchanges SET
       confirmed_by_from = ?, confirmed_by_to = ?,
       status = ?, confirmed_at = ?,
       version = version + 1, updated_at = ?
     WHERE id = ?`,
    [
      newConfirmedFrom, newConfirmedTo,
      bothConfirmed ? 'confirmed' : 'pending',
      bothConfirmed ? now : null,
      now, id,
    ]
  );
}

/**
 * Run on app open — expire any pending exchanges older than 48 hours.
 * Soft expiry: status becomes "unconfirmed". Record kept for audit.
 */
export async function expirePendingExchanges(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE exchanges SET status = 'unconfirmed', version = version + 1, updated_at = ?
     WHERE status = 'pending' AND expires_at < ?`,
    [new Date().toISOString(), new Date().toISOString()]
  );
}

export async function disputeExchange(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE exchanges SET status = 'disputed', version = version + 1, updated_at = ?
     WHERE id = ?`,
    [new Date().toISOString(), id]
  );
}

/** Delta sync — all exchanges updated after a timestamp */
export async function getExchangesSince(communityId: string, since: string): Promise<Exchange[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ExchangeRow>(
    `SELECT * FROM exchanges WHERE community_id = ? AND updated_at > ?`,
    [communityId, since]
  );
  return rows.map(rowToExchange);
}
