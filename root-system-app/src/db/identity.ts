// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Identity Queries
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { Identity, Location } from '../models/types';

interface IdentityRow {
  public_key:     string;
  device_id:      string;
  created_at:     string;
  handle:         string | null;
  bio:            string | null;
  location_json:  string | null;
  recovery_email: string | null;
  community_ids:  string;
}

function rowToIdentity(row: IdentityRow): Identity {
  return {
    publicKey:     row.public_key,
    deviceId:      row.device_id,
    createdAt:     row.created_at,
    handle:        row.handle,
    bio:           row.bio,
    location:      row.location_json ? JSON.parse(row.location_json) as Location : null,
    recoveryEmail: row.recovery_email,
    communityIds:  JSON.parse(row.community_ids) as string[],
  };
}

export async function getIdentity(): Promise<Identity | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<IdentityRow>('SELECT * FROM identity LIMIT 1');
  return row ? rowToIdentity(row) : null;
}

export async function saveIdentity(identity: Identity): Promise<void> {
  const db = await getDb();
  // identity table has at most one row — upsert by public_key
  await db.runAsync(
    `INSERT INTO identity
       (public_key, device_id, created_at, handle, bio, location_json, recovery_email, community_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rowid) DO UPDATE SET
       handle         = excluded.handle,
       bio            = excluded.bio,
       location_json  = excluded.location_json,
       recovery_email = excluded.recovery_email,
       community_ids  = excluded.community_ids`,
    [
      identity.publicKey,
      identity.deviceId,
      identity.createdAt,
      identity.handle,
      identity.bio,
      identity.location ? JSON.stringify(identity.location) : null,
      identity.recoveryEmail,
      JSON.stringify(identity.communityIds),
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
  const identity = await getIdentity();
  if (!identity) return;
  if (identity.communityIds.includes(communityId)) return;
  const updated = [...identity.communityIds, communityId];
  const db = await getDb();
  await db.runAsync(
    'UPDATE identity SET community_ids = ?',
    [JSON.stringify(updated)]
  );
}

export async function covenantAccepted(): Promise<boolean> {
  // Covenant is accepted if identity exists — you can't create identity without accepting
  const identity = await getIdentity();
  return identity !== null;
}
