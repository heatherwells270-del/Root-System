// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Blocked Handles
// Local only — never transmitted or synced.
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';

export async function blockHandle(handle: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO blocked_handles (handle, blocked_at) VALUES (?, ?)`,
    [handle, new Date().toISOString()]
  );
}

export async function unblockHandle(handle: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM blocked_handles WHERE handle = ?', [handle]);
}

export async function isBlocked(handle: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ handle: string }>(
    'SELECT handle FROM blocked_handles WHERE handle = ?', [handle]
  );
  return row !== null;
}

export async function getBlockedHandles(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ handle: string }>(
    'SELECT handle FROM blocked_handles ORDER BY blocked_at DESC'
  );
  return rows.map(r => r.handle);
}
