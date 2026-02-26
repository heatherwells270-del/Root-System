// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Identity Queries
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { Identity, Location } from '../models/types';

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

interface IdentityRow {
  public_key:           string;
  device_id:            string;
  created_at:           string;
  handle:               string | null;
  bio:                  string | null;
  location_json:        string | null;
  recovery_email:       string | null;
  community_ids:        string;
  covenant_accepted_at: string | null;
}

function rowToIdentity(row: IdentityRow): Identity {
  return {
    publicKey:          row.public_key,
    deviceId:           row.device_id,
    createdAt:          row.created_at,
    handle:             row.handle,
    bio:                row.bio,
    location:           safeParse<Location | null>(row.location_json, null),
    recoveryEmail:      row.recovery_email,
    communityIds:       safeParse<string[]>(row.community_ids, []),
    covenantAcceptedAt: row.covenant_accepted_at ?? null,
  };
}

export async function getIdentity(): Promise<Identity | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<IdentityRow>('SELECT * FROM identity LIMIT 1');
  return row ? rowToIdentity(row) : null;
}

export async function saveIdentity(identity: Identity): Promise<void> {
  const db = await getDb();
  // identity table has at most one row — upsert by rowid.
  // covenant_accepted_at is set once on INSERT (= createdAt) and never overwritten.
  await db.runAsync(
    `INSERT INTO identity
       (public_key, device_id, created_at, handle, bio, location_json, recovery_email,
        community_ids, covenant_accepted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rowid) DO UPDATE SET
       handle               = excluded.handle,
       bio                  = excluded.bio,
       location_json        = excluded.location_json,
       recovery_email       = excluded.recovery_email,
       community_ids        = excluded.community_ids`,
    [
      identity.publicKey,
      identity.deviceId,
      identity.createdAt,
      identity.handle,
      identity.bio,
      identity.location ? JSON.stringify(identity.location) : null,
      identity.recoveryEmail,
      JSON.stringify(identity.communityIds),
      identity.createdAt,   // covenant_accepted_at = time of account creation
    ]
  );
}

export async function updateIdentityProfile(
  handle: string | null,
  bio: string | null,
  location: Location | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE identity SET handle = ?, bio = ?, location_json = ?',
    [handle, bio, location ? JSON.stringify(location) : null]
  );
}

export async function addCommunityId(communityId: string): Promise<void> {
  const db = await getDb();
  // Atomic: json_insert only if value not already present — avoids read-then-write race
  await db.runAsync(
    `UPDATE identity SET community_ids = json_insert(community_ids, '$[#]', ?)
     WHERE NOT EXISTS (
       SELECT 1 FROM json_each(community_ids) WHERE value = ?
     )`,
    [communityId, communityId]
  );
}

export async function covenantAccepted(): Promise<boolean> {
  // Covenant is accepted if identity exists — you can't create identity without accepting
  const identity = await getIdentity();
  return identity !== null;
}
