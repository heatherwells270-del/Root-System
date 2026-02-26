// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — SQLite Schema
//
// This file defines every table. It runs once on first launch (and on
// version upgrades). Nothing is stored that isn't defined here.
//
// Design rules:
//   - JSON columns store structured data that doesn't need to be queried
//   - Indexed columns are ones we actually filter or sort by
//   - No nullable columns without a clear reason documented
// ═══════════════════════════════════════════════════════════════════════════

export const SCHEMA_VERSION = 2;

export const CREATE_TABLES = `

-- ─── VERSION ────────────────────────────────────────────────────────────────
-- Tracks schema version for future migrations.
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER NOT NULL,
  applied_at  TEXT    NOT NULL
);

-- ─── IDENTITY ───────────────────────────────────────────────────────────────
-- One row. This device's own identity.
-- Private key lives in SecureStore (expo-secure-store), NOT here.
CREATE TABLE IF NOT EXISTS identity (
  public_key      TEXT    NOT NULL,
  device_id       TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  handle          TEXT,
  bio             TEXT,
  -- Location stored as JSON: { zip, city, state, lat (2dp), lng (2dp) }
  -- lat/lng rounded before storage — never full precision
  location_json   TEXT,
  recovery_email  TEXT,
  -- JSON array of community IDs this device participates in
  community_ids   TEXT    NOT NULL DEFAULT '[]'
);

-- ─── COMMUNITIES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communities (
  id                      TEXT    PRIMARY KEY,
  name                    TEXT    NOT NULL,
  description             TEXT    NOT NULL DEFAULT '',
  zip_codes               TEXT    NOT NULL DEFAULT '[]',  -- JSON array
  lat                     REAL    NOT NULL,
  lng                     REAL    NOT NULL,
  radius_miles            REAL    NOT NULL DEFAULT 25,
  planter_public_key      TEXT    NOT NULL,
  planter_handle          TEXT    NOT NULL DEFAULT '',
  -- AES-256-GCM community key, encrypted with this device's public key.
  -- Null until key distribution completes.
  community_key_encrypted TEXT,
  covenant_text           TEXT    NOT NULL,
  zone_names              TEXT    NOT NULL DEFAULT '[]',  -- JSON array
  anchor_devices          TEXT    NOT NULL DEFAULT '[]',  -- JSON array of AnchorDevice
  created_at              TEXT    NOT NULL,
  status                  TEXT    NOT NULL DEFAULT 'active',
  sig                     TEXT    NOT NULL,
  version                 INTEGER NOT NULL DEFAULT 1,
  updated_at              TEXT    NOT NULL
);

-- ─── POSTS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id                      TEXT    PRIMARY KEY,
  community_id            TEXT    NOT NULL,
  type                    TEXT    NOT NULL,   -- offer | need | free
  free_subtype            TEXT,               -- items | services | knowledge
  category                TEXT    NOT NULL,
  zone                    TEXT    NOT NULL DEFAULT 'Any / Network-wide',
  title                   TEXT    NOT NULL,
  body                    TEXT    NOT NULL,
  tags                    TEXT    NOT NULL DEFAULT '[]',     -- JSON array
  recurring               INTEGER NOT NULL DEFAULT 0,        -- 0 | 1
  author_public_key       TEXT    NOT NULL,
  handle                  TEXT    NOT NULL DEFAULT 'Anonymous',
  bio                     TEXT,
  -- Encrypted with per-request key. Null until handshake completes.
  contact_info_encrypted  TEXT,
  timebank_hours          REAL,
  created_at              TEXT    NOT NULL,
  expires_at              TEXT    NOT NULL,
  renewed_at              TEXT,
  status                  TEXT    NOT NULL DEFAULT 'active',
  flags                   INTEGER NOT NULL DEFAULT 0,
  -- JSON array of hash(publicKey + postId) — no raw public keys
  flagged_by              TEXT    NOT NULL DEFAULT '[]',
  sig                     TEXT    NOT NULL,
  version                 INTEGER NOT NULL DEFAULT 1,
  updated_at              TEXT    NOT NULL,
  tombstone               INTEGER NOT NULL DEFAULT 0  -- 0 | 1, never reset to 0
);

CREATE INDEX IF NOT EXISTS idx_posts_community ON posts(community_id);
CREATE INDEX IF NOT EXISTS idx_posts_status    ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_type      ON posts(type);
CREATE INDEX IF NOT EXISTS idx_posts_created   ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_author    ON posts(author_public_key);
CREATE INDEX IF NOT EXISTS idx_posts_tombstone ON posts(tombstone);

-- ─── EXCHANGES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchanges (
  id                TEXT    PRIMARY KEY,
  community_id      TEXT    NOT NULL,
  from_public_key   TEXT    NOT NULL,
  to_public_key     TEXT    NOT NULL,
  from_handle       TEXT    NOT NULL,
  to_handle         TEXT    NOT NULL,
  hours             REAL    NOT NULL,
  description       TEXT    NOT NULL,
  emoji             TEXT,
  confirmed_by_from INTEGER NOT NULL DEFAULT 0,
  confirmed_by_to   INTEGER NOT NULL DEFAULT 0,
  -- pending | confirmed | unconfirmed | disputed
  -- unconfirmed = 48h passed without both confirming
  status            TEXT    NOT NULL DEFAULT 'pending',
  created_at        TEXT    NOT NULL,
  expires_at        TEXT    NOT NULL,  -- created_at + 48 hours
  confirmed_at      TEXT,
  sig               TEXT    NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exchanges_community  ON exchanges(community_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_from       ON exchanges(from_public_key);
CREATE INDEX IF NOT EXISTS idx_exchanges_to         ON exchanges(to_public_key);
CREATE INDEX IF NOT EXISTS idx_exchanges_status     ON exchanges(status);
CREATE INDEX IF NOT EXISTS idx_exchanges_expires    ON exchanges(expires_at);

-- ─── TRUST SCORES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trust_scores (
  public_key      TEXT    PRIMARY KEY,
  score           REAL    NOT NULL DEFAULT 5.0,
  public_score    REAL    NOT NULL DEFAULT 5.0,
  exchange_count  INTEGER NOT NULL DEFAULT 0,
  posts_survived  INTEGER NOT NULL DEFAULT 0,
  -- JSON array of TrustEvent — LOCAL ONLY, never transmitted
  history         TEXT    NOT NULL DEFAULT '[]',
  version         INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT    NOT NULL
);

-- ─── COALITIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coalitions (
  id            TEXT    PRIMARY KEY,
  community_id  TEXT    NOT NULL,
  title         TEXT    NOT NULL,
  purpose       TEXT    NOT NULL,
  contact       TEXT    NOT NULL,
  zone          TEXT    NOT NULL DEFAULT 'Any / Network-wide',
  member_keys   TEXT    NOT NULL DEFAULT '[]',    -- JSON array of public keys
  member_handles TEXT   NOT NULL DEFAULT '{}',    -- JSON object: { publicKey: handle }
  created_at    TEXT    NOT NULL,
  created_by    TEXT    NOT NULL,
  sig           TEXT    NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT    NOT NULL,
  tombstone     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_coalitions_community ON coalitions(community_id);

-- ─── KNOWLEDGE ENTRIES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id                TEXT    PRIMARY KEY,
  community_id      TEXT    NOT NULL,
  title             TEXT    NOT NULL,
  summary           TEXT    NOT NULL,
  body              TEXT    NOT NULL,
  category          TEXT    NOT NULL,
  tags              TEXT    NOT NULL DEFAULT '[]',
  handle            TEXT    NOT NULL,
  author_public_key TEXT    NOT NULL,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  flags             INTEGER NOT NULL DEFAULT 0,
  flagged_by        TEXT    NOT NULL DEFAULT '[]',
  status            TEXT    NOT NULL DEFAULT 'active',
  helpful           INTEGER NOT NULL DEFAULT 0,
  voted_by          TEXT    NOT NULL DEFAULT '[]',
  sig               TEXT    NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  db_updated_at     TEXT    NOT NULL,
  tombstone         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_knowledge_community ON knowledge_entries(community_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category  ON knowledge_entries(category);

-- ─── APPEALS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appeals (
  id              TEXT    PRIMARY KEY,
  community_id    TEXT    NOT NULL,
  post_id         TEXT    NOT NULL,
  appellant_key   TEXT    NOT NULL,
  appeal_text     TEXT    NOT NULL,
  restore_votes   INTEGER NOT NULL DEFAULT 0,
  uphold_votes    INTEGER NOT NULL DEFAULT 0,
  voter_hashes    TEXT    NOT NULL DEFAULT '[]',
  status          TEXT    NOT NULL DEFAULT 'pending',
  created_at      TEXT    NOT NULL,
  expires_at      TEXT    NOT NULL,
  sig             TEXT    NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appeals_community ON appeals(community_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status    ON appeals(status);

-- ─── VECTOR CLOCKS ──────────────────────────────────────────────────────────
-- Tracks what this device has seen from each peer, per community.
CREATE TABLE IF NOT EXISTS vector_clocks (
  community_id TEXT    NOT NULL,
  device_id    TEXT    NOT NULL,
  sequence     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT    NOT NULL,
  PRIMARY KEY (community_id, device_id)
);

-- ─── BLOCKED HANDLES ────────────────────────────────────────────────────────
-- Local only. Never transmitted.
CREATE TABLE IF NOT EXISTS blocked_handles (
  handle     TEXT    NOT NULL,
  blocked_at TEXT    NOT NULL,
  PRIMARY KEY (handle)
);

-- ─── POST LOG ───────────────────────────────────────────────────────────────
-- Rate limiting. Tracks own posts by timestamp.
CREATE TABLE IF NOT EXISTS post_log (
  id         TEXT    PRIMARY KEY,
  posted_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_log_time ON post_log(posted_at);

-- ─── SYNC META ───────────────────────────────────────────────────────────────
-- Tracks relay sync state per community.
-- last_pull_at: ISO timestamp of the most recently acknowledged buffer item.
-- Next buffer-pull sends "since: last_pull_at" so we don't re-fetch old blobs.
CREATE TABLE IF NOT EXISTS sync_meta (
  community_id  TEXT    PRIMARY KEY,
  last_pull_at  TEXT    NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
);

-- ─── CONTACT INFO ────────────────────────────────────────────────────────────
-- Author's contact info per post. LOCAL ONLY. Never transmitted.
-- Read when approving a contact request; deleted if post is withdrawn.
CREATE TABLE IF NOT EXISTS contact_info (
  post_id     TEXT    PRIMARY KEY,
  contact     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

-- ─── CONTACT REVEALS ─────────────────────────────────────────────────────────
-- Contacts revealed to this device via approved requests.
-- Stores the decrypted plaintext. LOCAL ONLY. Never transmitted.
CREATE TABLE IF NOT EXISTS contact_reveals (
  post_id           TEXT    PRIMARY KEY,
  author_public_key TEXT    NOT NULL,
  contact           TEXT    NOT NULL,
  revealed_at       TEXT    NOT NULL
);

`;

// ─── MIGRATIONS ─────────────────────────────────────────────────────────────
// When schema version increases, add a migration here.
// Migrations run in order. Never edit existing migrations — add new ones.
export const MIGRATIONS: Record<number, string> = {
  // v1 is the initial schema above — no migration needed
  2: `ALTER TABLE identity ADD COLUMN covenant_accepted_at TEXT;`,
};
