// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Knowledge Entry Queries
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { KnowledgeEntry, CategoryId } from '../models/types';

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

interface KnowledgeRow {
  id: string; community_id: string;
  title: string; summary: string; body: string;
  category: string; tags: string;
  handle: string; author_public_key: string;
  created_at: string; updated_at: string;
  flags: number; flagged_by: string; status: string;
  helpful: number; voted_by: string;
  sig: string; version: number; db_updated_at: string; tombstone: number;
}

function rowToEntry(r: KnowledgeRow): KnowledgeEntry {
  return {
    id: r.id, communityId: r.community_id,
    title: r.title, summary: r.summary, body: r.body,
    category:  r.category  as CategoryId,
    tags:      safeParse<string[]>(r.tags, []),
    handle: r.handle, authorPublicKey: r.author_public_key,
    createdAt: r.created_at, updatedAt: r.updated_at,
    flags: r.flags,
    flaggedBy: safeParse<string[]>(r.flagged_by, []),
    status:    r.status as 'active' | 'removed',
    helpful:   r.helpful,
    votedBy:   safeParse<string[]>(r.voted_by, []),
    _sig: r.sig, _version: r.version, _updatedAt: r.db_updated_at,
    _tombstone: r.tombstone === 1,
  };
}

// ─── READS ──────────────────────────────────────────────────────────────────

export async function getKnowledgeEntries(
  communityId: string,
  category?: CategoryId,
  sort: 'recent' | 'helpful' = 'recent',
): Promise<KnowledgeEntry[]> {
  const db    = await getDb();
  const order = sort === 'helpful'
    ? 'helpful DESC, created_at DESC'
    : 'created_at DESC';
  const rows = category
    ? await db.getAllAsync<KnowledgeRow>(
        `SELECT * FROM knowledge_entries
         WHERE community_id = ? AND category = ? AND tombstone = 0 AND status = 'active'
         ORDER BY ${order}`,
        [communityId, category]
      )
    : await db.getAllAsync<KnowledgeRow>(
        `SELECT * FROM knowledge_entries
         WHERE community_id = ? AND tombstone = 0 AND status = 'active'
         ORDER BY ${order}`,
        [communityId]
      );
  return rows.map(rowToEntry);
}

export async function getKnowledgeEntry(id: string): Promise<KnowledgeEntry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<KnowledgeRow>(
    'SELECT * FROM knowledge_entries WHERE id = ?', [id]
  );
  return row ? rowToEntry(row) : null;
}

// ─── WRITES ─────────────────────────────────────────────────────────────────

export async function upsertKnowledgeEntry(entry: KnowledgeEntry): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO knowledge_entries (
       id, community_id, title, summary, body, category, tags,
       handle, author_public_key, created_at, updated_at,
       flags, flagged_by, status, helpful, voted_by,
       sig, version, db_updated_at, tombstone
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       title         = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.title         ELSE knowledge_entries.title         END,
       summary       = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.summary       ELSE knowledge_entries.summary       END,
       body          = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.body          ELSE knowledge_entries.body          END,
       flags         = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.flags         ELSE knowledge_entries.flags         END,
       flagged_by    = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.flagged_by    ELSE knowledge_entries.flagged_by    END,
       status        = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.status        ELSE knowledge_entries.status        END,
       helpful       = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.helpful       ELSE knowledge_entries.helpful       END,
       voted_by      = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.voted_by      ELSE knowledge_entries.voted_by      END,
       updated_at    = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.updated_at    ELSE knowledge_entries.updated_at    END,
       tombstone     = CASE WHEN excluded.tombstone = 1 THEN 1 ELSE knowledge_entries.tombstone END,
       version       = MAX(knowledge_entries.version, excluded.version),
       db_updated_at = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.db_updated_at ELSE knowledge_entries.db_updated_at END,
       sig           = CASE WHEN excluded.version > knowledge_entries.version THEN excluded.sig           ELSE knowledge_entries.sig           END`,
    [
      entry.id, entry.communityId, entry.title, entry.summary, entry.body,
      entry.category, JSON.stringify(entry.tags),
      entry.handle, entry.authorPublicKey,
      entry.createdAt, entry.updatedAt,
      entry.flags, JSON.stringify(entry.flaggedBy),
      entry.status, entry.helpful, JSON.stringify(entry.votedBy),
      entry._sig, entry._version, entry._updatedAt, entry._tombstone ? 1 : 0,
    ]
  );
}

/** Atomic flag — same pattern as posts.ts flagPost */
export async function flagKnowledgeEntry(id: string, flagHash: string): Promise<void> {
  const db  = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE knowledge_entries SET
       flagged_by    = json_insert(flagged_by, '$[#]', ?),
       flags         = flags + 1,
       status        = CASE WHEN flags + 1 >= 3 AND status != 'removed' THEN 'removed' ELSE status END,
       version       = version + 1,
       db_updated_at = ?
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1 FROM json_each(flagged_by) WHERE value = ?
       )`,
    [flagHash, now, id, flagHash]
  );
}

/** Atomic helpful vote — prevents double-voting without a read-then-write race */
export async function voteHelpful(id: string, voteHash: string): Promise<void> {
  const db  = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE knowledge_entries SET
       voted_by      = json_insert(voted_by, '$[#]', ?),
       helpful       = helpful + 1,
       version       = version + 1,
       db_updated_at = ?
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1 FROM json_each(voted_by) WHERE value = ?
       )`,
    [voteHash, now, id, voteHash]
  );
}

export async function tombstoneKnowledgeEntry(id: string, sig: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE knowledge_entries SET
       tombstone = 1, sig = ?, version = version + 1, db_updated_at = ?
     WHERE id = ?`,
    [sig, new Date().toISOString(), id]
  );
}

/** Delta sync */
export async function getKnowledgeEntriesSince(
  communityId: string,
  since: string,
): Promise<KnowledgeEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<KnowledgeRow>(
    `SELECT * FROM knowledge_entries WHERE community_id = ? AND db_updated_at > ?`,
    [communityId, since]
  );
  return rows.map(rowToEntry);
}
