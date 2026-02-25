// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Sync State Queries
//
// Tracks per-community relay sync state (last buffer pull timestamp).
// The relay only sends buffer items pushed AFTER this timestamp, so we
// never re-download a post blob we've already processed.
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';

const EPOCH = '1970-01-01T00:00:00.000Z';

export async function getLastPullAt(communityId: string): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ last_pull_at: string }>(
    'SELECT last_pull_at FROM sync_meta WHERE community_id = ?',
    [communityId]
  );
  return row?.last_pull_at ?? EPOCH;
}

export async function setLastPullAt(communityId: string, timestamp: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_meta (community_id, last_pull_at) VALUES (?, ?)
     ON CONFLICT(community_id) DO UPDATE SET last_pull_at = excluded.last_pull_at`,
    [communityId, timestamp]
  );
}
