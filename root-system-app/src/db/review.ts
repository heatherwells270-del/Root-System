// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Review Queries
//
// Everything the community needs to moderate itself:
//   - Flagged posts (1+ flags, not yet removed)
//   - Removed posts + appeals
//   - Community behavior signals (derived from exchanges + posts)
//
// DESIGN NOTE: Signals are not accusations. They surface data patterns
// so the community can make informed decisions together. No user is labeled
// a "bad actor" — patterns are described in plain, non-judgmental language.
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { Post, Appeal } from '../models/types';

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

// ─── TYPES ──────────────────────────────────────────────────────────────────

/**
 * A pattern worth watching. Not an accusation.
 * Shown to the whole community to surface concerns — the community decides.
 */
export type SignalPattern =
  | 'always-receiver'    // Received 3x more hours than given, 3+ exchanges
  | 'ghost-logger'       // Logged 2+ exchanges the other party never confirmed
  | 'flag-accumulator'   // 2+ different posts flagged
  | 'high-velocity';     // 4+ posts in first 7 days of account

export interface MemberSignal {
  publicKey:         string;
  handle:            string;
  patterns:          SignalPattern[];
  postCount:         number;
  flaggedPostCount:  number;
  confirmedExchanges: number;
  hoursGiven:        number;
  hoursReceived:     number;
  ghostLogCount:     number;  // their-initiated exchanges other party didn't confirm
}

interface PostRow {
  id: string; community_id: string; type: string; free_subtype: string | null;
  category: string; zone: string; title: string; body: string; tags: string;
  recurring: number; author_public_key: string; handle: string; bio: string | null;
  contact_info_encrypted: string | null; timebank_hours: number | null;
  created_at: string; expires_at: string; renewed_at: string | null; status: string;
  flags: number; flagged_by: string; sig: string; version: number;
  updated_at: string; tombstone: number;
}

interface AppealRow {
  id: string; community_id: string; post_id: string; appellant_key: string;
  appeal_text: string; restore_votes: number; uphold_votes: number;
  voter_hashes: string; status: string; created_at: string; expires_at: string;
  sig: string; version: number; updated_at: string;
}

function rowToPost(r: PostRow): Post {
  return {
    id: r.id, communityId: r.community_id,
    type: r.type as Post['type'], freeSubtype: r.free_subtype as Post['freeSubtype'],
    category: r.category as Post['category'], zone: r.zone,
    title: r.title, body: r.body, tags: safeParse<string[]>(r.tags, []),
    recurring: r.recurring === 1, authorPublicKey: r.author_public_key,
    handle: r.handle, bio: r.bio, contactInfoEncrypted: r.contact_info_encrypted,
    timebankHours: r.timebank_hours,
    createdAt: r.created_at, expiresAt: r.expires_at, renewedAt: r.renewed_at,
    status: r.status as Post['status'], flags: r.flags,
    flaggedBy: safeParse<string[]>(r.flagged_by, []),
    _sig: r.sig, _version: r.version, _updatedAt: r.updated_at,
    _tombstone: r.tombstone === 1,
  };
}

function rowToAppeal(r: AppealRow): Appeal {
  return {
    id: r.id, communityId: r.community_id, postId: r.post_id,
    appellantKey: r.appellant_key, appealText: r.appeal_text,
    restoreVotes: r.restore_votes, upholdVotes: r.uphold_votes,
    voterHashes: safeParse<string[]>(r.voter_hashes, []),
    status: r.status as Appeal['status'],
    createdAt: r.created_at, expiresAt: r.expires_at,
    _sig: r.sig, _version: r.version, _updatedAt: r.updated_at,
  };
}

// ─── FLAGGED POSTS ──────────────────────────────────────────────────────────

/** Posts with 1+ flags that the community hasn't removed yet (status = active). */
export async function getFlaggedPosts(communityId: string): Promise<Post[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PostRow>(
    `SELECT * FROM posts
     WHERE community_id = ? AND flags > 0 AND status = 'active' AND tombstone = 0
     ORDER BY flags DESC, updated_at DESC`,
    [communityId]
  );
  return rows.map(rowToPost);
}

/** Posts auto-removed by flag threshold — may have active appeals. */
export async function getRemovedPosts(communityId: string): Promise<Post[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PostRow>(
    `SELECT * FROM posts
     WHERE community_id = ? AND status = 'removed' AND tombstone = 0
     ORDER BY updated_at DESC`,
    [communityId]
  );
  return rows.map(rowToPost);
}

// ─── APPEALS ────────────────────────────────────────────────────────────────

export async function getAppeals(communityId: string): Promise<Appeal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AppealRow>(
    `SELECT * FROM appeals WHERE community_id = ? ORDER BY created_at DESC`,
    [communityId]
  );
  return rows.map(rowToAppeal);
}

export async function getAppealForPost(postId: string): Promise<Appeal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AppealRow>(
    `SELECT * FROM appeals WHERE post_id = ? ORDER BY created_at DESC LIMIT 1`,
    [postId]
  );
  return row ? rowToAppeal(row) : null;
}

export async function upsertAppeal(appeal: Appeal): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO appeals (
       id, community_id, post_id, appellant_key, appeal_text,
       restore_votes, uphold_votes, voter_hashes, status,
       created_at, expires_at, sig, version, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       restore_votes = CASE WHEN excluded.version > appeals.version THEN excluded.restore_votes ELSE appeals.restore_votes END,
       uphold_votes  = CASE WHEN excluded.version > appeals.version THEN excluded.uphold_votes  ELSE appeals.uphold_votes  END,
       voter_hashes  = CASE WHEN excluded.version > appeals.version THEN excluded.voter_hashes  ELSE appeals.voter_hashes  END,
       status        = CASE WHEN excluded.version > appeals.version THEN excluded.status        ELSE appeals.status        END,
       version       = MAX(appeals.version, excluded.version),
       updated_at    = CASE WHEN excluded.version > appeals.version THEN excluded.updated_at    ELSE appeals.updated_at    END`,
    [
      appeal.id, appeal.communityId, appeal.postId, appeal.appellantKey, appeal.appealText,
      appeal.restoreVotes, appeal.upholdVotes, JSON.stringify(appeal.voterHashes),
      appeal.status, appeal.createdAt, appeal.expiresAt,
      appeal._sig, appeal._version, appeal._updatedAt,
    ]
  );
}

/**
 * Cast a vote on an appeal.
 * vote: 'restore' = bring post back, 'uphold' = removal was correct.
 * Uses voterHash to prevent double-voting without exposing who voted.
 */
export async function voteOnAppeal(
  appealId: string,
  vote: 'restore' | 'uphold',
  voterHash: string
): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<AppealRow>(
    'SELECT * FROM appeals WHERE id = ?', [appealId]
  );
  if (!row) return;
  const appeal = rowToAppeal(row);
  if (appeal.status !== 'pending') return;
  if (appeal.voterHashes.includes(voterHash)) return; // already voted

  const newVoterHashes = [...appeal.voterHashes, voterHash];
  const newRestore = appeal.restoreVotes + (vote === 'restore' ? 1 : 0);
  const newUphold  = appeal.upholdVotes  + (vote === 'uphold'  ? 1 : 0);

  // Resolve when either side reaches 5 votes
  let newStatus: Appeal['status'] = 'pending';
  if (newRestore >= 5) newStatus = 'restored';
  if (newUphold  >= 5) newStatus = 'upheld';

  const now = new Date().toISOString();
  await db.execAsync('BEGIN');
  try {
    await db.runAsync(
      `UPDATE appeals SET restore_votes = ?, uphold_votes = ?, voter_hashes = ?,
         status = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
      [newRestore, newUphold, JSON.stringify(newVoterHashes), newStatus, now, appealId]
    );
    // If restored, set post status back to active in the same transaction
    if (newStatus === 'restored') {
      await db.runAsync(
        `UPDATE posts SET status = 'active', version = version + 1, updated_at = ?
         WHERE id = ?`,
        [now, appeal.postId]
      );
    }
    await db.execAsync('COMMIT');
  } catch (err) {
    try { await db.execAsync('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

// ─── COMMUNITY SIGNALS ──────────────────────────────────────────────────────

/**
 * Derives behavior patterns for community members visible in this device's DB.
 * Signals are factual — counts and ratios, no labels.
 * The community reads them and decides together.
 */
export async function getCommunitySignals(communityId: string): Promise<MemberSignal[]> {
  const db = await getDb();

  // Post stats per author
  interface PostStats {
    author_public_key: string; handle: string;
    post_count: number; flagged_count: number; earliest_post: string;
  }
  const postStats = await db.getAllAsync<PostStats>(
    `SELECT author_public_key, handle,
            COUNT(*) as post_count,
            SUM(CASE WHEN flags > 0 THEN 1 ELSE 0 END) as flagged_count,
            MIN(created_at) as earliest_post
     FROM posts
     WHERE community_id = ? AND tombstone = 0
     GROUP BY author_public_key`,
    [communityId]
  );

  // Exchange stats per participant
  interface ExchangeStats {
    public_key: string;
    hours_given: number;       // confirmed, from=them
    hours_received: number;    // confirmed, to=them
    confirmed_count: number;
    ghost_count: number;       // they logged (from=them), other party never confirmed (unconfirmed status)
  }
  const exchangeStats = await db.getAllAsync<ExchangeStats>(
    `SELECT public_key,
            SUM(hours_given)    as hours_given,
            SUM(hours_received) as hours_received,
            SUM(confirmed)      as confirmed_count,
            SUM(ghost)          as ghost_count
     FROM (
       SELECT from_public_key as public_key,
              CASE WHEN status = 'confirmed' THEN hours ELSE 0 END as hours_given,
              0 as hours_received,
              CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END as confirmed,
              CASE WHEN status = 'unconfirmed' AND confirmed_by_to = 0 THEN 1 ELSE 0 END as ghost
       FROM exchanges WHERE community_id = ?
       UNION ALL
       SELECT to_public_key as public_key,
              0 as hours_given,
              CASE WHEN status = 'confirmed' THEN hours ELSE 0 END as hours_received,
              0 as confirmed,
              0 as ghost
       FROM exchanges WHERE community_id = ?
     )
     GROUP BY public_key`,
    [communityId, communityId]
  );

  // Build index for quick lookup
  const exchangeIndex = new Map<string, ExchangeStats>();
  for (const e of exchangeStats) exchangeIndex.set(e.public_key, e);

  const signals: MemberSignal[] = [];

  for (const p of postStats) {
    const ex = exchangeIndex.get(p.author_public_key);
    const hoursGiven    = ex?.hours_given    ?? 0;
    const hoursReceived = ex?.hours_received ?? 0;
    const confirmed     = ex?.confirmed_count ?? 0;
    const ghost         = ex?.ghost_count    ?? 0;

    const patterns: SignalPattern[] = [];

    // Always-receiver: received 3x+ more than given, with at least 3 confirmed exchanges
    if (confirmed >= 3 && hoursGiven > 0 && hoursReceived / hoursGiven >= 3) {
      patterns.push('always-receiver');
    }
    // No exchanges but received hours (no give at all, received at least 3h)
    if (hoursGiven === 0 && hoursReceived >= 3) {
      patterns.push('always-receiver');
    }

    // Ghost-logger: logged 2+ exchanges other party never confirmed
    if (ghost >= 2) {
      patterns.push('ghost-logger');
    }

    // Flag-accumulator: 2+ different posts flagged
    if (p.flagged_count >= 2) {
      patterns.push('flag-accumulator');
    }

    // High-velocity: 4+ posts in first 7 days
    if (p.post_count >= 4) {
      const firstPostDate = new Date(p.earliest_post).getTime();
      const daysSinceFirst = (Date.now() - firstPostDate) / 86400000;
      if (daysSinceFirst <= 7) {
        patterns.push('high-velocity');
      }
    }

    // Only include members who have at least one pattern OR flagged posts
    if (patterns.length > 0 || p.flagged_count > 0) {
      signals.push({
        publicKey:          p.author_public_key,
        handle:             p.handle,
        patterns,
        postCount:          p.post_count,
        flaggedPostCount:   p.flagged_count,
        confirmedExchanges: confirmed,
        hoursGiven,
        hoursReceived,
        ghostLogCount:      ghost,
      });
    }
  }

  // Sort: most patterns first, then by flagged post count
  signals.sort((a, b) =>
    (b.patterns.length - a.patterns.length) || (b.flaggedPostCount - a.flaggedPostCount)
  );

  return signals;
}
