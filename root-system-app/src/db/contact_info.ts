// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Contact Info DB
//
// Two local-only tables:
//   contact_info    — author stores their contact string per post
//   contact_reveals — requester stores decrypted contact after approval
//
// Neither table is ever transmitted. Contact never leaves the device except
// as an encrypted blob sent directly to a specific requester's public key.
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';

// ─── AUTHOR SIDE ─────────────────────────────────────────────────────────────

/** Save (or replace) contact info for a post the author just created. */
export async function saveContactInfo(postId: string, contact: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO contact_info (post_id, contact, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET contact = excluded.contact`,
    [postId, contact, new Date().toISOString()]
  );
}

/** Retrieve contact info for a post (author side, for approving requests). */
export async function getContactInfo(postId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ contact: string }>(
    'SELECT contact FROM contact_info WHERE post_id = ?',
    [postId]
  );
  return row?.contact ?? null;
}

/** Delete contact info when a post is withdrawn. */
export async function deleteContactInfo(postId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM contact_info WHERE post_id = ?', [postId]);
}

// ─── REQUESTER SIDE ──────────────────────────────────────────────────────────

/** Store a revealed (decrypted) contact for a post. */
export async function saveReveal(
  postId: string,
  authorPublicKey: string,
  contact: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO contact_reveals (post_id, author_public_key, contact, revealed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET contact = excluded.contact, revealed_at = excluded.revealed_at`,
    [postId, authorPublicKey, contact, new Date().toISOString()]
  );
}

/** Get a previously revealed contact for a post, or null if not yet received. */
export async function getReveal(postId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ contact: string }>(
    'SELECT contact FROM contact_reveals WHERE post_id = ?',
    [postId]
  );
  return row?.contact ?? null;
}

/** Check multiple posts at once — returns a map of postId → contact. */
export async function getRevealMap(
  postIds: string[]
): Promise<Record<string, string>> {
  if (postIds.length === 0) return {};
  const db = await getDb();
  const placeholders = postIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ post_id: string; contact: string }>(
    `SELECT post_id, contact FROM contact_reveals WHERE post_id IN (${placeholders})`,
    postIds
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.post_id] = r.contact;
  return map;
}
