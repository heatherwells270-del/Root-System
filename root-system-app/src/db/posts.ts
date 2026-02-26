// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Post Queries
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { Post, PostStatus, PostType, CategoryId } from '../models/types';

interface PostRow {
  id: string; community_id: string; type: string; free_subtype: string | null;
  category: string; zone: string; title: string; body: string; tags: string;
  recurring: number; author_public_key: string; handle: string; bio: string | null;
  contact_info_encrypted: string | null; timebank_hours: number | null;
  created_at: string; expires_at: string; renewed_at: string | null; status: string;
  flags: number; flagged_by: string; sig: string; version: number;
  updated_at: string; tombstone: number;
}

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

function rowToPost(r: PostRow): Post {
  return {
    id: r.id, communityId: r.community_id,
    type: r.type as PostType,
    freeSubtype: r.free_subtype as Post['freeSubtype'],
    category: r.category as CategoryId, zone: r.zone,
    title: r.title, body: r.body,
    tags: safeParse<string[]>(r.tags, []),
    recurring: r.recurring === 1,
    authorPublicKey: r.author_public_key, handle: r.handle, bio: r.bio,
    contactInfoEncrypted: r.contact_info_encrypted,
    timebankHours: r.timebank_hours,
    createdAt: r.created_at, expiresAt: r.expires_at,
    renewedAt: r.renewed_at, status: r.status as PostStatus,
    flags: r.flags, flaggedBy: safeParse<string[]>(r.flagged_by, []),
    _sig: r.sig, _version: r.version, _updatedAt: r.updated_at,
    _tombstone: r.tombstone === 1,
  };
}

type BindValue = string | number | null;

function postToParams(p: Post): BindValue[] {
  return [
    p.id, p.communityId, p.type, p.freeSubtype ?? null,
    p.category, p.zone, p.title, p.body,
    JSON.stringify(p.tags), p.recurring ? 1 : 0,
    p.authorPublicKey, p.handle, p.bio ?? null,
    p.contactInfoEncrypted ?? null, p.timebankHours ?? null,
    p.createdAt, p.expiresAt, p.renewedAt ?? null, p.status,
    p.flags, JSON.stringify(p.flaggedBy),
    p._sig, p._version, p._updatedAt, p._tombstone ? 1 : 0,
  ];
}

// ─── READS ──────────────────────────────────────────────────────────────────

export async function getPost(id: string): Promise<Post | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<PostRow>('SELECT * FROM posts WHERE id = ?', [id]);
  return row ? rowToPost(row) : null;
}

export async function getActivePosts(communityId: string): Promise<Post[]> {
  const db = await getDb();
  const now = new Date().toISOString();
  const rows = await db.getAllAsync<PostRow>(
    `SELECT * FROM posts
     WHERE community_id = ? AND status = 'active' AND tombstone = 0
       AND expires_at > ?
     ORDER BY created_at DESC`,
    [communityId, now]
  );
  return rows.map(rowToPost);
}

export async function getMyPosts(authorPublicKey: string): Promise<Post[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PostRow>(
    `SELECT * FROM posts WHERE author_public_key = ? AND tombstone = 0
     ORDER BY created_at DESC`,
    [authorPublicKey]
  );
  return rows.map(rowToPost);
}

// ─── WRITES ─────────────────────────────────────────────────────────────────

export async function upsertPost(post: Post): Promise<void> {
  const db = await getDb();
  // On conflict: only update if incoming version is newer
  await db.runAsync(
    `INSERT INTO posts (
       id, community_id, type, free_subtype, category, zone, title, body,
       tags, recurring, author_public_key, handle, bio,
       contact_info_encrypted, timebank_hours,
       created_at, expires_at, renewed_at, status,
       flags, flagged_by, sig, version, updated_at, tombstone
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       status    = CASE WHEN excluded.version > posts.version AND excluded.updated_at >= posts.updated_at THEN excluded.status    ELSE posts.status    END,
       flags     = CASE WHEN excluded.version > posts.version AND excluded.updated_at >= posts.updated_at THEN excluded.flags     ELSE posts.flags     END,
       flagged_by= CASE WHEN excluded.version > posts.version AND excluded.updated_at >= posts.updated_at THEN excluded.flagged_by ELSE posts.flagged_by END,
       renewed_at= CASE WHEN excluded.version > posts.version AND excluded.updated_at >= posts.updated_at THEN excluded.renewed_at ELSE posts.renewed_at END,
       expires_at= CASE WHEN excluded.version > posts.version AND excluded.updated_at >= posts.updated_at THEN excluded.expires_at ELSE posts.expires_at END,
       tombstone = CASE WHEN excluded.tombstone = 1 THEN 1 ELSE posts.tombstone END,
       version   = MAX(posts.version, excluded.version),
       updated_at= CASE WHEN excluded.version > posts.version AND excluded.updated_at >= posts.updated_at THEN excluded.updated_at ELSE posts.updated_at END`,
    postToParams(post)
  );
}

export async function tombstonePost(id: string, sig: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE posts SET tombstone = 1, status = 'withdrawn', sig = ?, updated_at = ?
     WHERE id = ?`,
    [sig, new Date().toISOString(), id]
  );
}

export async function renewPost(id: string, newExpiresAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE posts SET expires_at = ?, renewed_at = ?, version = version + 1, updated_at = ?
     WHERE id = ?`,
    [newExpiresAt, new Date().toISOString(), new Date().toISOString(), id]
  );
}

export async function flagPost(id: string, flagHash: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  // Atomic: only update if flagHash is not already in the JSON array.
  // json_each() iterates the array; NOT EXISTS prevents double-flagging without a
  // read-then-write race. flags + 1 >= 3 triggers 'removed' in a single statement.
  await db.runAsync(
    `UPDATE posts SET
       flagged_by = json_insert(flagged_by, '$[#]', ?),
       flags      = flags + 1,
       status     = CASE WHEN flags + 1 >= 3 AND status != 'removed' THEN 'removed' ELSE status END,
       version    = version + 1,
       updated_at = ?
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1 FROM json_each(flagged_by) WHERE value = ?
       )`,
    [flagHash, now, id, flagHash]
  );
}

// ─── RATE LIMITING ──────────────────────────────────────────────────────────

export async function logPost(postId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO post_log (id, posted_at) VALUES (?, ?)',
    [postId, new Date().toISOString()]
  );
}

export async function getPostCountSince(since: Date): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM post_log WHERE posted_at > ?',
    [since.toISOString()]
  );
  return row?.count ?? 0;
}

// ─── COMMUNITY STATS ────────────────────────────────────────────────────────

export interface CommunityPostStats {
  activePosts: number;
  postsThisWeek: number;
}

export async function getCommunityPostStats(communityId: string): Promise<CommunityPostStats> {
  const db = await getDb();
  const now     = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = await db.getFirstAsync<{ active_posts: number; posts_this_week: number }>(
    `SELECT
       SUM(CASE WHEN status = 'active' AND tombstone = 0 AND expires_at > ? THEN 1 ELSE 0 END) as active_posts,
       SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as posts_this_week
     FROM posts WHERE community_id = ? AND tombstone = 0`,
    [now, weekAgo, communityId]
  );
  return {
    activePosts:   row?.active_posts   ?? 0,
    postsThisWeek: row?.posts_this_week ?? 0,
  };
}

// ─── SYNC ───────────────────────────────────────────────────────────────────

/** Returns all posts updated after a given timestamp — used for delta sync */
export async function getPostsSince(communityId: string, since: string): Promise<Post[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PostRow>(
    `SELECT * FROM posts WHERE community_id = ? AND updated_at > ?`,
    [communityId, since]
  );
  return rows.map(rowToPost);
}
