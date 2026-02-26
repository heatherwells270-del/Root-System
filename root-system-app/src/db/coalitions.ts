// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Coalition Queries
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { Coalition } from '../models/types';

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

interface CoalitionRow {
  id: string; community_id: string;
  title: string; purpose: string; contact: string; zone: string;
  member_keys: string; member_handles: string;
  created_at: string; created_by: string;
  sig: string; version: number; updated_at: string; tombstone: number;
}

function rowToCoalition(r: CoalitionRow): Coalition {
  return {
    id: r.id, communityId: r.community_id,
    title: r.title, purpose: r.purpose, contact: r.contact, zone: r.zone,
    memberKeys:    safeParse<string[]>(r.member_keys, []),
    memberHandles: safeParse<Record<string, string>>(r.member_handles, {}),
    createdAt: r.created_at, createdBy: r.created_by,
    _sig: r.sig, _version: r.version, _updatedAt: r.updated_at,
    _tombstone: r.tombstone === 1,
  };
}

// ─── READS ──────────────────────────────────────────────────────────────────

export async function getCoalitionsForCommunity(communityId: string): Promise<Coalition[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CoalitionRow>(
    `SELECT * FROM coalitions
     WHERE community_id = ? AND tombstone = 0
     ORDER BY created_at DESC`,
    [communityId]
  );
  return rows.map(rowToCoalition);
}

export async function getCoalition(id: string): Promise<Coalition | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CoalitionRow>(
    'SELECT * FROM coalitions WHERE id = ?', [id]
  );
  return row ? rowToCoalition(row) : null;
}

// ─── WRITES ─────────────────────────────────────────────────────────────────

export async function upsertCoalition(c: Coalition): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO coalitions (
       id, community_id, title, purpose, contact, zone,
       member_keys, member_handles, created_at, created_by,
       sig, version, updated_at, tombstone
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       title          = CASE WHEN excluded.version > coalitions.version THEN excluded.title          ELSE coalitions.title          END,
       purpose        = CASE WHEN excluded.version > coalitions.version THEN excluded.purpose        ELSE coalitions.purpose        END,
       contact        = CASE WHEN excluded.version > coalitions.version THEN excluded.contact        ELSE coalitions.contact        END,
       zone           = CASE WHEN excluded.version > coalitions.version THEN excluded.zone           ELSE coalitions.zone           END,
       member_keys    = CASE WHEN excluded.version > coalitions.version THEN excluded.member_keys    ELSE coalitions.member_keys    END,
       member_handles = CASE WHEN excluded.version > coalitions.version THEN excluded.member_handles ELSE coalitions.member_handles END,
       tombstone      = CASE WHEN excluded.tombstone = 1 THEN 1 ELSE coalitions.tombstone END,
       version        = MAX(coalitions.version, excluded.version),
       updated_at     = CASE WHEN excluded.version > coalitions.version THEN excluded.updated_at     ELSE coalitions.updated_at     END,
       sig            = CASE WHEN excluded.version > coalitions.version THEN excluded.sig            ELSE coalitions.sig            END`,
    [
      c.id, c.communityId, c.title, c.purpose, c.contact, c.zone,
      JSON.stringify(c.memberKeys), JSON.stringify(c.memberHandles),
      c.createdAt, c.createdBy,
      c._sig, c._version, c._updatedAt, c._tombstone ? 1 : 0,
    ]
  );
}

/**
 * Add a member to a coalition. No-op if already a member.
 * Atomic: read + write inside a SQLite transaction to prevent race conditions.
 * Caller must re-sign and sync after this call.
 */
export async function joinCoalition(
  id: string,
  publicKey: string,
  handle: string,
): Promise<void> {
  const db = await getDb();
  await db.execAsync('BEGIN');
  try {
    const row = await db.getFirstAsync<CoalitionRow>(
      'SELECT * FROM coalitions WHERE id = ?', [id]
    );
    if (!row || row.tombstone) { await db.execAsync('ROLLBACK'); return; }
    const keys    = safeParse<string[]>(row.member_keys, []);
    if (keys.includes(publicKey)) { await db.execAsync('ROLLBACK'); return; }
    const handles = safeParse<Record<string, string>>(row.member_handles, {});
    const now     = new Date().toISOString();
    await db.runAsync(
      `UPDATE coalitions SET
         member_keys = ?, member_handles = ?,
         version = version + 1, updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify([...keys, publicKey]),
        JSON.stringify({ ...handles, [publicKey]: handle }),
        now, id,
      ]
    );
    await db.execAsync('COMMIT');
  } catch (err) {
    try { await db.execAsync('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

export async function leaveCoalition(id: string, publicKey: string): Promise<void> {
  const db = await getDb();
  await db.execAsync('BEGIN');
  try {
    const row = await db.getFirstAsync<CoalitionRow>(
      'SELECT * FROM coalitions WHERE id = ?', [id]
    );
    if (!row || row.tombstone) { await db.execAsync('ROLLBACK'); return; }
    const keys    = safeParse<string[]>(row.member_keys, []);
    if (!keys.includes(publicKey)) { await db.execAsync('ROLLBACK'); return; }
    const handles = safeParse<Record<string, string>>(row.member_handles, {});
    delete handles[publicKey];
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE coalitions SET
         member_keys = ?, member_handles = ?,
         version = version + 1, updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(keys.filter(k => k !== publicKey)),
        JSON.stringify(handles),
        now, id,
      ]
    );
    await db.execAsync('COMMIT');
  } catch (err) {
    try { await db.execAsync('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

export async function tombstoneCoalition(id: string, sig: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE coalitions SET tombstone = 1, sig = ?, version = version + 1, updated_at = ?
     WHERE id = ?`,
    [sig, new Date().toISOString(), id]
  );
}

/** Delta sync — all coalitions updated after a timestamp */
export async function getCoalitionsSince(communityId: string, since: string): Promise<Coalition[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CoalitionRow>(
    `SELECT * FROM coalitions WHERE community_id = ? AND updated_at > ?`,
    [communityId, since]
  );
  return rows.map(rowToCoalition);
}
