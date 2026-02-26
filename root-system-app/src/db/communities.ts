// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Community Queries
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { Community, CommunityStatus, AnchorDevice } from '../models/types';

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

interface CommunityRow {
  id: string; name: string; description: string;
  zip_codes: string; lat: number; lng: number; radius_miles: number;
  planter_public_key: string; planter_handle: string;
  community_key_encrypted: string | null;
  covenant_text: string; zone_names: string; anchor_devices: string;
  created_at: string; status: string; sig: string;
  version: number; updated_at: string;
}

function rowToCommunity(r: CommunityRow): Community {
  return {
    id:                    r.id,
    name:                  r.name,
    description:           r.description,
    zipCodes:              safeParse<string[]>(r.zip_codes, []),
    lat:                   r.lat,
    lng:                   r.lng,
    radiusMiles:           r.radius_miles,
    planterPublicKey:      r.planter_public_key,
    planterHandle:         r.planter_handle,
    communityKeyEncrypted: r.community_key_encrypted,
    covenantText:          r.covenant_text,
    zoneNames:             safeParse<string[]>(r.zone_names, []),
    anchorDevices:         safeParse<AnchorDevice[]>(r.anchor_devices, []),
    createdAt:             r.created_at,
    status:                r.status as CommunityStatus,
    _sig:                  r.sig,
    _version:              r.version,
    _updatedAt:            r.updated_at,
  };
}

type BindValue = string | number | null;

function communityToParams(c: Community): BindValue[] {
  return [
    c.id, c.name, c.description,
    JSON.stringify(c.zipCodes), c.lat, c.lng, c.radiusMiles,
    c.planterPublicKey, c.planterHandle, c.communityKeyEncrypted ?? null,
    c.covenantText, JSON.stringify(c.zoneNames),
    JSON.stringify(c.anchorDevices), c.createdAt,
    c.status, c._sig, c._version, c._updatedAt,
  ];
}

export async function getCommunity(id: string): Promise<Community | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CommunityRow>(
    'SELECT * FROM communities WHERE id = ?', [id]
  );
  return row ? rowToCommunity(row) : null;
}

/**
 * Returns the first community record on this device, or null.
 * Most devices will only ever belong to one community.
 */
export async function getMyCommunity(): Promise<Community | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CommunityRow>(
    'SELECT * FROM communities ORDER BY created_at ASC LIMIT 1'
  );
  return row ? rowToCommunity(row) : null;
}

/**
 * Upsert a community record.
 * On conflict, only updates mutable fields (name, description, handles, status,
 * zones, anchor devices) when the incoming version is newer.
 * The communityKeyEncrypted column is never overwritten with null —
 * once set, it stays until explicitly replaced with a newer value.
 */
export async function upsertCommunity(community: Community): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO communities (
       id, name, description, zip_codes, lat, lng, radius_miles,
       planter_public_key, planter_handle, community_key_encrypted,
       covenant_text, zone_names, anchor_devices, created_at,
       status, sig, version, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name                    = CASE WHEN excluded.version > communities.version THEN excluded.name                    ELSE communities.name                    END,
       description             = CASE WHEN excluded.version > communities.version THEN excluded.description             ELSE communities.description             END,
       planter_handle          = CASE WHEN excluded.version > communities.version THEN excluded.planter_handle          ELSE communities.planter_handle          END,
       community_key_encrypted = COALESCE(excluded.community_key_encrypted, communities.community_key_encrypted),
       status                  = CASE WHEN excluded.version > communities.version THEN excluded.status                  ELSE communities.status                  END,
       zone_names              = CASE WHEN excluded.version > communities.version THEN excluded.zone_names              ELSE communities.zone_names              END,
       anchor_devices          = CASE WHEN excluded.version > communities.version THEN excluded.anchor_devices          ELSE communities.anchor_devices          END,
       version                 = MAX(communities.version, excluded.version),
       updated_at              = CASE WHEN excluded.version > communities.version THEN excluded.updated_at              ELSE communities.updated_at              END`,
    communityToParams(community)
  );
}
