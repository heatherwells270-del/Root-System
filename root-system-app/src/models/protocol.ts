// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Relay Protocol Wire Format  v1
//
// This file is the single source of truth for every message that travels
// between a device and the relay, or between two devices via WebRTC.
//
// Both the app (src/) and the relay server (root-system-relay/) import
// from this file. If a message type isn't defined here, it doesn't exist.
// ═══════════════════════════════════════════════════════════════════════════

import type { PublicKeyHex, Signature, SyncItem, VectorClock } from './types';

export const PROTOCOL_VERSION = 1;

// ─── PHASE 1: AUTH ─────────────────────────────────────────────────────────
// Challenge-response. Device proves it holds its private key.
// Timestamp must be within 60 seconds — prevents replay attacks.

export interface C2R_Hello {
  v: typeof PROTOCOL_VERSION;
  type: 'hello';
  publicKey: PublicKeyHex;
  deviceId:  string;
  timestamp: string;   // ISO timestamp
  sig:       Signature; // sign(publicKey + deviceId + timestamp, privateKey)
}

export interface R2C_Challenge {
  v: typeof PROTOCOL_VERSION;
  type: 'challenge';
  nonce: string;   // random 32-byte hex string, single use
}

export interface C2R_Auth {
  v: typeof PROTOCOL_VERSION;
  type: 'auth';
  nonce: string;
  sig:   Signature; // sign(nonce, privateKey)
}

export interface R2C_Authed {
  v: typeof PROTOCOL_VERSION;
  type:      'authed';
  sessionId: string;   // ephemeral — gone when connection closes
}

export interface R2C_AuthFailed {
  v: typeof PROTOCOL_VERSION;
  type:   'auth-failed';
  reason: string;
}

// ─── PHASE 2: PRESENCE ─────────────────────────────────────────────────────

export interface C2R_Join {
  v: typeof PROTOCOL_VERSION;
  type:        'join';
  communityId: string;
  sessionId:   string;
  vectorClock: VectorClock;
}

export interface PeerInfo {
  publicKey: PublicKeyHex;
  deviceId:  string;
  sessionId: string;
}

export interface R2C_Peers {
  v: typeof PROTOCOL_VERSION;
  type:  'peers';
  peers: PeerInfo[];
}

export interface R2C_PeerJoined {
  v: typeof PROTOCOL_VERSION;
  type:      'peer-joined';
  publicKey: PublicKeyHex;
  deviceId:  string;
  sessionId: string;
}

export interface R2C_PeerLeft {
  v: typeof PROTOCOL_VERSION;
  type:      'peer-left';
  sessionId: string;
}

// ─── PHASE 3: WEBRTC SIGNALING ─────────────────────────────────────────────
// Relay passes these through without reading them.
// Once the WebRTC connection opens, relay is out of the loop.

export interface C2R_Offer {
  v: typeof PROTOCOL_VERSION;
  type: 'offer';
  to:   string;   // target sessionId
  sdp:  string;
}

export interface R2C_Offer {
  v: typeof PROTOCOL_VERSION;
  type: 'offer';
  from: string;   // source sessionId
  sdp:  string;
}

export interface C2R_Answer {
  v: typeof PROTOCOL_VERSION;
  type: 'answer';
  to:   string;
  sdp:  string;
}

export interface R2C_Answer {
  v: typeof PROTOCOL_VERSION;
  type: 'answer';
  from: string;
  sdp:  string;
}

export interface C2R_Ice {
  v: typeof PROTOCOL_VERSION;
  type:      'ice';
  to:        string;
  candidate: string;
}

export interface R2C_Ice {
  v: typeof PROTOCOL_VERSION;
  type:      'ice';
  from:      string;
  candidate: string;
}

// ─── PHASE 4: DEVICE-TO-DEVICE SYNC ────────────────────────────────────────
// These travel over the WebRTC data channel — NOT through the relay.

export interface D2D_SyncHello {
  v: typeof PROTOCOL_VERSION;
  type:        'sync-hello';
  vectorClock: VectorClock;
}

export interface D2D_SyncData {
  v: typeof PROTOCOL_VERSION;
  type:  'sync-data';
  items: SyncItem[];
  sig:   Signature;   // sign(items, senderPrivateKey)
}

export interface D2D_SyncAck {
  v: typeof PROTOCOL_VERSION;
  type:     'sync-ack';
  received: string[];   // ids of items received
}

// ─── PHASE 5: POST BUFFER ──────────────────────────────────────────────────
// Encrypted blobs the relay holds for 48 hours.
// Relay cannot read them — they're encrypted with the community key.

export interface C2R_BufferPush {
  v: typeof PROTOCOL_VERSION;
  type:          'buffer-push';
  communityId:   string;
  encryptedBlob: string;   // base64-encoded AES-256-GCM ciphertext
  pushedAt:      string;   // ISO timestamp
}

export interface R2C_BufferAck {
  v: typeof PROTOCOL_VERSION;
  type:     'buffer-ack';
  bufferId: string;
}

export interface C2R_BufferPull {
  v: typeof PROTOCOL_VERSION;
  type:        'buffer-pull';
  communityId: string;
  since:       string;   // ISO timestamp — only items pushed after this
}

export interface BufferItem {
  bufferId:      string;
  encryptedBlob: string;
  pushedAt:      string;
}

export interface R2C_BufferItems {
  v: typeof PROTOCOL_VERSION;
  type:  'buffer-items';
  items: BufferItem[];
}

export interface C2R_BufferItemAck {
  v: typeof PROTOCOL_VERSION;
  type:     'buffer-item-ack';
  bufferId: string;   // relay deletes this item immediately on receipt
}

// ─── PHASE 6: COMMUNITY KEY DISTRIBUTION ───────────────────────────────────
// Community key (for post buffer encryption) flows from planter to new member,
// encrypted to new member's public key. Relay passes it through, cannot read it.

export interface C2R_KeyRequest {
  v: typeof PROTOCOL_VERSION;
  type:        'key-request';
  communityId: string;
  publicKey:   PublicKeyHex;
  sig:         Signature;
}

export interface R2C_KeyRequestPending {
  v: typeof PROTOCOL_VERSION;
  type:               'key-request-pending';
  communityId:        string;
  requesterPublicKey: PublicKeyHex;
}

export interface C2R_KeyApprove {
  v: typeof PROTOCOL_VERSION;
  type:               'key-approve';
  communityId:        string;
  requesterPublicKey: PublicKeyHex;
  // communityKey encrypted with requesterPublicKey — only they can open it
  encryptedKey:       string;
}

export interface R2C_CommunityKey {
  v: typeof PROTOCOL_VERSION;
  type:         'community-key';
  communityId:  string;
  encryptedKey: string;
}

// ─── PHASE 7: CONTACT REVEAL HANDSHAKE ────────────────────────────────────
// Contact info is never transmitted in plaintext.
// Requester asks → author decides → author encrypts to requester's public key.

export interface D2D_ContactRequest {
  v: typeof PROTOCOL_VERSION;
  type:              'contact-request';
  postId:            string;
  requesterPublicKey: PublicKeyHex;
  sig:               Signature;
}

export interface D2D_ContactResponse {
  v: typeof PROTOCOL_VERSION;
  type: 'contact-response';
  postId: string;
  // contactInfo encrypted with requesterPublicKey — only they can read it
  encryptedContact: string;
  sig: Signature;
}

export interface D2D_ContactDeclined {
  v: typeof PROTOCOL_VERSION;
  type:   'contact-declined';
  postId: string;
}

// ─── UNION TYPES ────────────────────────────────────────────────────────────
// Exhaustive unions — use these for message routing in client and server.

export type ClientToRelayMessage =
  | C2R_Hello
  | C2R_Auth
  | C2R_Join
  | C2R_Offer
  | C2R_Answer
  | C2R_Ice
  | C2R_BufferPush
  | C2R_BufferPull
  | C2R_BufferItemAck
  | C2R_KeyRequest
  | C2R_KeyApprove;

export type RelayToClientMessage =
  | R2C_Challenge
  | R2C_Authed
  | R2C_AuthFailed
  | R2C_Peers
  | R2C_PeerJoined
  | R2C_PeerLeft
  | R2C_Offer
  | R2C_Answer
  | R2C_Ice
  | R2C_BufferAck
  | R2C_BufferItems
  | R2C_KeyRequestPending
  | R2C_CommunityKey;

export type DeviceToDeviceMessage =
  | D2D_SyncHello
  | D2D_SyncData
  | D2D_SyncAck
  | D2D_ContactRequest
  | D2D_ContactResponse
  | D2D_ContactDeclined;
