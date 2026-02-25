// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Sync Manager
//
// Ties the relay client to local SQLite storage.
//
// Responsibilities:
//   - Connect to relay, authenticate, join community
//   - Pull buffer on connect (encrypted post blobs since last pull)
//   - Decrypt, verify signature, upsert into local DB
//   - Push new local posts to buffer (encrypted with community key)
//   - Store/retrieve community key in SecureStore
//   - Surface key-request-pending events to the planter's UI
//
// What this does NOT do:
//   - WebRTC peer connections (Phase 4 — device-to-device sync)
//     TODO Phase 4: wire up react-native-webrtc after relay sync is stable
//
// Usage:
//   await startSync(communityId)     // call on app foreground / community switch
//   await pushPostToRelay(post)      // call after saving a post locally
//   stopSync()                       // call on app background
// ═══════════════════════════════════════════════════════════════════════════

import * as SecureStore from 'expo-secure-store';
import { RelayClient } from './relay';
import { getIdentity } from '../db/identity';
import { upsertPost } from '../db/posts';
import { getLastPullAt, setLastPullAt } from '../db/sync';
import { encryptForBuffer, decryptFromBuffer } from '../crypto/encrypt';
import { verify, canonicalPost } from '../crypto/keypair';
import type { Post } from '../models/types';

// ─── RELAY URL ────────────────────────────────────────────────────────────────
// In development: set EXPO_PUBLIC_RELAY_URL in your .env.local
// In production:  point to your deployed relay (wss://relay.yourserver.com)

const RELAY_URL = process.env['EXPO_PUBLIC_RELAY_URL'] ?? 'ws://localhost:8080';

// ─── COMMUNITY KEY STORAGE ────────────────────────────────────────────────────
// Community key (AES-256 base64) lives in SecureStore, keyed by communityId.
// It is never stored in SQLite.

function ckKey(communityId: string): string {
  return `rs_ck_${communityId}`;
}

export async function getCommunityKey(communityId: string): Promise<string | null> {
  return SecureStore.getItemAsync(ckKey(communityId));
}

export async function storeCommunityKey(communityId: string, keyBase64: string): Promise<void> {
  await SecureStore.setItemAsync(ckKey(communityId), keyBase64);
}

// ─── SINGLETON ────────────────────────────────────────────────────────────────

let _relay: RelayClient | null = null;
let _activeCommunityId: string | null = null;

// Callbacks registered by app screens
const _onCommunityKeyCallbacks: Array<(communityId: string, encryptedKey: string) => void> = [];
const _onKeyRequestCallbacks:   Array<(communityId: string, requesterPublicKey: string) => void> = [];

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

/**
 * Connect to the relay for a community.
 * Call on app foreground and on community switch.
 * Idempotent — if already connected to the same community, does nothing.
 */
export async function startSync(communityId: string): Promise<void> {
  const identity = await getIdentity();
  if (!identity) return;   // identity not initialized yet

  // Already connected to this community
  if (_relay?.isAuthed() && _activeCommunityId === communityId) return;

  // Tear down any existing connection
  _relay?.stop();

  const relay = new RelayClient(RELAY_URL, identity.publicKey, identity.deviceId);
  _relay = relay;
  _activeCommunityId = communityId;

  // ── On auth complete ───────────────────────────────────────────────────────
  relay.on('_authed', () => {
    relay.join(communityId, {});

    // Pull any buffered posts we haven't processed yet
    getLastPullAt(communityId)
      .then(since => relay.pullBuffer(communityId, since))
      .catch(() => {});

    // If we don't have the community key yet, ask the relay to forward a request
    getCommunityKey(communityId).then(key => {
      if (!key) void relay.requestCommunityKey(communityId);
    }).catch(() => {});
  });

  // ── Buffer items received ──────────────────────────────────────────────────
  relay.on('buffer-items', (msg) => {
    const items = msg['items'] as Array<{
      bufferId: string; encryptedBlob: string; pushedAt: string;
    }>;
    if (!Array.isArray(items) || items.length === 0) return;
    void _processBufferItems(communityId, items, relay);
  });

  // ── Community key received ─────────────────────────────────────────────────
  // The key arrives encrypted to this device's public key. The app (e.g. the
  // community join screen) must call decryptCommunityKey() + storeCommunityKey().
  relay.on('community-key', (msg) => {
    const encryptedKey = msg['encryptedKey'] as string;
    if (!encryptedKey) return;
    _onCommunityKeyCallbacks.forEach(cb => cb(communityId, encryptedKey));
  });

  // ── Key request pending (planter only) ────────────────────────────────────
  // The planter's device receives this when a member requests the community key.
  // The planter's UI should approve/deny and call approveCommunityKey().
  relay.on('key-request-pending', (msg) => {
    const reqCommunityId   = msg['communityId']        as string;
    const requesterPublicKey = msg['requesterPublicKey'] as string;
    if (!reqCommunityId || !requesterPublicKey) return;
    _onKeyRequestCallbacks.forEach(cb => cb(reqCommunityId, requesterPublicKey));
  });

  relay.start();
}

export function stopSync(): void {
  _relay?.stop();
  _relay = null;
  _activeCommunityId = null;
}

export function getRelay(): RelayClient | null {
  return _relay;
}

// ─── BUFFER PROCESSING ────────────────────────────────────────────────────────

async function _processBufferItems(
  communityId: string,
  items: Array<{ bufferId: string; encryptedBlob: string; pushedAt: string }>,
  relay: RelayClient,
): Promise<void> {
  const communityKey = await getCommunityKey(communityId);
  if (!communityKey) {
    // No key yet — request it and wait for next buffer-items delivery
    void relay.requestCommunityKey(communityId);
    return;
  }

  let latestPushedAt = '';

  for (const item of items) {
    try {
      // Decrypt: AES-256-GCM with community key
      const json = await decryptFromBuffer(item.encryptedBlob, communityKey);
      const post = JSON.parse(json) as Post;

      // Verify Ed25519 signature before persisting — drop unsigned or tampered posts
      const canonical = canonicalPost(post);
      const valid = await verify(canonical, post._sig, post.authorPublicKey);
      if (!valid) {
        console.warn(`[sync] dropping post with invalid signature id=${post.id}`);
        relay.ackBufferItem(item.bufferId);  // ack so relay cleans up
        continue;
      }

      // Merge into local SQLite (version-based CRDT — upsertPost handles conflicts)
      await upsertPost(post);

      // Tell relay it can delete this item
      relay.ackBufferItem(item.bufferId);

      if (item.pushedAt > latestPushedAt) latestPushedAt = item.pushedAt;
    } catch (err) {
      console.warn('[sync] error processing buffer item', err);
      // Don't ack — leave it in the buffer for the next pull attempt
    }
  }

  // Advance the watermark so we don't re-fetch these items
  if (latestPushedAt) {
    await setLastPullAt(communityId, latestPushedAt);
  }
}

// ─── POST PUSH ────────────────────────────────────────────────────────────────

/**
 * Encrypt a post and push it to the relay buffer.
 * Call this after saving a post to local SQLite.
 * No-op if relay is disconnected or community key is unavailable.
 */
export async function pushPostToRelay(post: Post): Promise<void> {
  if (!_relay?.isAuthed() || _activeCommunityId !== post.communityId) return;

  const communityKey = await getCommunityKey(post.communityId);
  if (!communityKey) return;

  const json = JSON.stringify(post);
  const encrypted = await encryptForBuffer(json, communityKey);
  _relay.pushToBuffer(post.communityId, encrypted);
}

// ─── PLANTER KEY APPROVAL ─────────────────────────────────────────────────────

/**
 * Planter approves a key request: encrypt the community key for the requester
 * and send it via the relay.
 *
 * NOTE (Phase 6): encryptCommunityKeyFor uses X25519 ECDH. Before shipping
 * contact reveal or key distribution, verify edwardsToMontgomeryPub is used
 * for the recipient public key conversion. See encrypt.ts TODO.
 */
export async function approveCommunityKey(
  communityId: string,
  requesterPublicKey: string,
  communityKeyBase64: string,
  encryptKeyForRecipient: (key: string, recipientPubKey: string) => Promise<string>,
): Promise<void> {
  if (!_relay?.isAuthed()) return;
  const encryptedKey = await encryptKeyForRecipient(communityKeyBase64, requesterPublicKey);
  _relay.approveCommunityKey(communityId, requesterPublicKey, encryptedKey);
}

// ─── CALLBACK REGISTRATION ────────────────────────────────────────────────────

/**
 * Register a callback for when this device receives a community key from the
 * relay. The caller must decrypt it and call storeCommunityKey().
 * Returns an unsubscribe function.
 */
export function onCommunityKeyReceived(
  cb: (communityId: string, encryptedKey: string) => void,
): () => void {
  _onCommunityKeyCallbacks.push(cb);
  return () => {
    const i = _onCommunityKeyCallbacks.indexOf(cb);
    if (i >= 0) _onCommunityKeyCallbacks.splice(i, 1);
  };
}

/**
 * Register a callback for when a member requests the community key
 * (planter only). The planter's UI calls this to show an approval prompt.
 * Returns an unsubscribe function.
 */
export function onKeyRequestPending(
  cb: (communityId: string, requesterPublicKey: string) => void,
): () => void {
  _onKeyRequestCallbacks.push(cb);
  return () => {
    const i = _onKeyRequestCallbacks.indexOf(cb);
    if (i >= 0) _onKeyRequestCallbacks.splice(i, 1);
  };
}
