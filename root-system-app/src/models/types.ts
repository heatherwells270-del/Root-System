// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Core Types
// Every data model in the app. Nothing gets stored or transmitted that
// isn't defined here first.
// ═══════════════════════════════════════════════════════════════════════════

// ─── PRIMITIVES ────────────────────────────────────────────────────────────

export type ISOTimestamp = string;   // "2026-02-25T14:30:00.000Z"
export type PublicKeyHex = string;   // Ed25519 public key, hex-encoded
export type Signature = string;      // Ed25519 signature, hex-encoded
export type Hash = string;           // SHA-256 hash, hex-encoded

export type PostType = 'offer' | 'need' | 'free';
export type FreeSubtype = 'items' | 'services' | 'knowledge';
export type PostStatus = 'active' | 'expired' | 'removed' | 'withdrawn';
export type ExchangeStatus = 'pending' | 'confirmed' | 'unconfirmed' | 'disputed';
export type CommunityStatus = 'active' | 'dormant' | 'archived';

export type CategoryId =
  | 'skills' | 'goods' | 'care' | 'food' | 'tech'
  | 'housing' | 'transport' | 'knowledge' | 'grief' | 'labor';

// ─── IDENTITY ──────────────────────────────────────────────────────────────

export interface Location {
  zip:   string | null;
  city:  string | null;
  state: string | null;
  // Rounded to 2 decimal places (~1 mile precision).
  // Never stored or transmitted at full precision.
  lat:   number | null;
  lng:   number | null;
}

export interface Identity {
  publicKey:  PublicKeyHex;
  // privateKey lives in secure storage only — never in this object at rest
  deviceId:   string;
  createdAt:  ISOTimestamp;

  // All optional — user chooses what to fill in
  handle:   string | null;
  bio:      string | null;   // 200 chars max
  location: Location | null;

  // Opt-in only. Relay stores hash(email) + encryptedKeyBackup.
  // User sees exactly what this means before they set it.
  recoveryEmail: string | null;

  communityIds: string[];
}

// ─── POST ──────────────────────────────────────────────────────────────────

export interface Post {
  id:          string;
  communityId: string;

  type:        PostType;
  freeSubtype: FreeSubtype | null;
  category:    CategoryId;
  zone:        string;
  title:       string;   // 150 chars max
  body:        string;   // 1000 chars max
  tags:        string[];
  recurring:   boolean;

  // Pseudonymous attribution
  authorPublicKey: PublicKeyHex;
  handle:          string;
  bio:             string | null;

  // Contact info is encrypted with a per-request key.
  // Never transmitted in plaintext. Null until reveal handshake completes.
  contactInfoEncrypted: string | null;

  timebankHours: number | null;

  createdAt:  ISOTimestamp;
  expiresAt:  ISOTimestamp;   // createdAt + 7 days
  renewedAt:  ISOTimestamp | null;
  status:     PostStatus;

  // Moderation
  flags:     number;
  // hash(publicKey + postId) — prevents double-flag without exposing who flagged
  flaggedBy: Hash[];

  // Sync metadata
  _sig:       Signature;   // sign(post content, authorPrivateKey)
  _version:   number;      // increments on each update
  _updatedAt: ISOTimestamp;
  _tombstone: boolean;     // true = deleted, spreads to all peers, never cleaned up
}

// ─── EXCHANGE (TIME BANK) ──────────────────────────────────────────────────

export interface Exchange {
  id:          string;
  communityId: string;

  fromPublicKey: PublicKeyHex;
  toPublicKey:   PublicKeyHex;
  fromHandle:    string;
  toHandle:      string;

  hours:       number;
  description: string;
  emoji:       string | null;

  confirmedByFrom: boolean;
  confirmedByTo:   boolean;
  status:          ExchangeStatus;

  createdAt:   ISOTimestamp;
  // Auto-expires to "unconfirmed" after 48 hours.
  // If you won't confirm in 2 days, it didn't happen.
  expiresAt:   ISOTimestamp;
  confirmedAt: ISOTimestamp | null;

  _sig:       Signature;
  _version:   number;
  _updatedAt: ISOTimestamp;
}

// ─── TRUST SCORE ───────────────────────────────────────────────────────────

export type TrustReason =
  | 'exchange_confirmed'
  | 'post_survived'
  | 'flag_received'
  | 'post_removed'
  | 'appeal_restored'
  | 'appeal_upheld';

export interface TrustEvent {
  timestamp: ISOTimestamp;
  delta:     number;
  reason:    TrustReason;
}

// What gets transmitted to peers — visible on posts
export interface PublicTrustScore {
  publicKey:     PublicKeyHex;
  publicScore:   number;   // rounded to 1 decimal
  exchangeCount: number;
  postsSurvived: number;
  _version:      number;
  _updatedAt:    ISOTimestamp;
}

// Full record — local device only, never transmitted
export interface TrustScore extends PublicTrustScore {
  score:   number;   // 2.0 – 10.0, starts at 5.0
  history: TrustEvent[];
}

// ─── COALITION ─────────────────────────────────────────────────────────────

export interface Coalition {
  id:          string;
  communityId: string;

  title:   string;
  purpose: string;
  contact: string;
  zone:    string;

  memberKeys:    PublicKeyHex[];
  memberHandles: Record<PublicKeyHex, string>;

  createdAt: ISOTimestamp;
  createdBy: PublicKeyHex;

  _sig:       Signature;
  _version:   number;
  _updatedAt: ISOTimestamp;
  _tombstone: boolean;
}

// ─── KNOWLEDGE ENTRY ───────────────────────────────────────────────────────

export interface KnowledgeEntry {
  id:          string;
  communityId: string;

  title:    string;
  summary:  string;
  body:     string;
  category: CategoryId;
  tags:     string[];

  handle:   string;
  authorPublicKey: PublicKeyHex;

  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;

  flags:     number;
  flaggedBy: Hash[];
  status:    'active' | 'removed';

  helpful:  number;
  votedBy:  Hash[];   // hash(publicKey + entryId)

  _sig:       Signature;
  _version:   number;
  _updatedAt: ISOTimestamp;
  _tombstone: boolean;
}

// ─── COMMUNITY ─────────────────────────────────────────────────────────────

export interface AnchorDevice {
  publicKey:  PublicKeyHex;
  lastSeenAt: ISOTimestamp;
}

export interface Community {
  id:          string;
  name:        string;
  description: string;

  zipCodes:    string[];
  lat:         number;
  lng:         number;
  radiusMiles: number;

  planterPublicKey: PublicKeyHex;
  planterHandle:    string;

  // Symmetric key (AES-256-GCM) for encrypting the relay post buffer.
  // Distributed encrypted to each member's public key on join.
  // Never stored in plaintext outside of active memory.
  communityKeyEncrypted: string | null;

  covenantText: string;
  zoneNames:    string[];

  anchorDevices: AnchorDevice[];

  createdAt: ISOTimestamp;
  status:    CommunityStatus;

  // Signed by planterPublicKey — proves planter created this record
  _sig:       Signature;
  _version:   number;
  _updatedAt: ISOTimestamp;
}

// ─── APPEAL ────────────────────────────────────────────────────────────────

export type AppealStatus = 'pending' | 'restored' | 'upheld';

export interface Appeal {
  id:          string;
  communityId: string;
  postId:      string;

  appellantKey: PublicKeyHex;
  appealText:   string;

  restoreVotes: number;
  upholdVotes:  number;
  voterHashes:  Hash[];   // hash(publicKey + appealId)

  status:    AppealStatus;
  createdAt: ISOTimestamp;
  expiresAt: ISOTimestamp;   // 7 days

  _sig:       Signature;
  _version:   number;
  _updatedAt: ISOTimestamp;
}

// ─── SYNC DELTA ────────────────────────────────────────────────────────────
// The unit of sync — what one device sends another

export type SyncItem =
  | ({ _type: 'post' }      & Post)
  | ({ _type: 'exchange' }  & Exchange)
  | ({ _type: 'coalition' } & Coalition)
  | ({ _type: 'knowledge' } & KnowledgeEntry)
  | ({ _type: 'trust' }     & PublicTrustScore)
  | ({ _type: 'appeal' }    & Appeal);

export type VectorClock = Record<string, number>;   // { deviceId: sequenceNumber }
