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
// WebRTC peer-to-device sync (Phase 4):
//   - Activated automatically after expo prebuild (native module required)
//   - Degrades gracefully in Expo Go (relay buffer used as sole transport)
//
// Usage:
//   await startSync(communityId)     // call on app foreground / community switch
//   await pushPostToRelay(post)      // call after saving a post locally
//   stopSync()                       // call on app background
// ═══════════════════════════════════════════════════════════════════════════

import * as SecureStore from 'expo-secure-store';
import { RelayClient } from './relay';
import { WebRTCPeerManager } from './webrtc';
import { getIdentity } from '../db/identity';
import { getCommunity } from '../db/communities';
import { upsertPost } from '../db/posts';
import { getLastPullAt, setLastPullAt } from '../db/sync';
import { saveReveal } from '../db/contact_info';
import { encryptForBuffer, decryptFromBuffer, decryptCommunityKey, encryptForRecipient, decryptFromSender } from '../crypto/encrypt';
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

// ─── SYNC STATUS ──────────────────────────────────────────────────────────────

export interface SyncStatus {
  connected: boolean;
  queued: number;
}

// ─── SINGLETON ────────────────────────────────────────────────────────────────

let _relay: RelayClient | null = null;
let _activeCommunityId: string | null = null;
let _webrtc: WebRTCPeerManager | null = null;

// Callbacks registered by app screens
const _onCommunityKeyCallbacks: Array<(communityId: string, planterPublicKey: string) => void> = [];
const _onKeyRequestCallbacks:   Array<(communityId: string, requesterPublicKey: string) => void> = [];
const _onSyncStatusCallbacks:   Array<(status: SyncStatus) => void> = [];

export interface IncomingContactRequest {
  requestId: string;
  communityId: string;
  requesterPublicKey: string;
  requesterHandle: string;
  postId: string;
  postTitle: string;
}
const _onContactRequestCallbacks: Array<(req: IncomingContactRequest) => void> = [];
const _onContactResponseCallbacks: Array<(postId: string) => void> = [];
const _onContactDeclinedCallbacks: Array<(postId: string) => void> = [];

// Posts queued while the relay is disconnected — flushed on next auth.
// Capped to prevent unbounded memory growth during long offline periods.
const MAX_PENDING_PUSHES = 100;
const _pendingPushes: Post[] = [];

function _emitSyncStatus(connected: boolean): void {
  const status: SyncStatus = { connected, queued: _pendingPushes.length };
  _onSyncStatusCallbacks.forEach(cb => {
    try { cb(status); }
    catch (e) { console.error('[sync] onSyncStatus callback threw', e); }
  });
}

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

  // ── WebRTC peer signaling ──────────────────────────────────────────────────
  relay.on('peers',        (msg) => _webrtc?.initFromPeerList(msg['peers'] ?? []));
  relay.on('peer-joined',  (msg) => _webrtc?.onPeerJoined(msg['sessionId'], msg['publicKey']));
  relay.on('offer',        (msg) => { void _webrtc?.onOffer(msg['from'], msg['sdp']); });
  relay.on('answer',       (msg) => { void _webrtc?.onAnswer(msg['from'], msg['sdp']); });
  relay.on('ice',          (msg) => { void _webrtc?.onIce(msg['from'], msg['candidate']); });

  // ── On auth complete ───────────────────────────────────────────────────────
  relay.on('_authed', () => {
    relay.join(communityId, {});

    // Initialise WebRTC peer manager (no-op if native module not available)
    _webrtc?.stop();
    _webrtc = new WebRTCPeerManager(relay, identity.publicKey, communityId,
      () => getCommunityKey(communityId));

    // Pull any buffered posts we haven't processed yet
    getLastPullAt(communityId)
      .then(since => relay.pullBuffer(communityId, since))
      .catch(() => {});

    // If we don't have the community key yet, ask the relay to forward a request
    getCommunityKey(communityId).then(key => {
      if (!key) void relay.requestCommunityKey(communityId);
    }).catch(() => {});

    // Flush posts that were saved while the relay was disconnected
    if (_pendingPushes.length > 0) {
      const toFlush = _pendingPushes.splice(0);
      for (const post of toFlush) {
        void pushPostToRelay(post);
      }
    }
    _emitSyncStatus(true);
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
  // The key arrives encrypted to this device's public key.
  // Auto-decrypted and stored here so no UI screen needs to be mounted.
  //
  // SECURITY: We verify planterPublicKey matches the community record before
  // performing X25519 ECDH. Without this check, a malicious relay operator could
  // inject a `community-key` message with their own keypair as planterPublicKey,
  // causing this device to store an attacker-controlled community key and
  // encrypt all subsequent posts with it (key substitution attack).
  relay.on('community-key', (msg) => {
    const encryptedKey     = msg['encryptedKey']     as string;
    const planterPublicKey = msg['planterPublicKey'] as string;
    if (!encryptedKey || !planterPublicKey) return;

    getCommunity(communityId)
      .then(community => {
        if (!community) {
          console.warn('[sync] community-key rejected: community record not found locally');
          return null;
        }
        if (community.planterPublicKey !== planterPublicKey) {
          console.warn('[sync] community-key rejected: planterPublicKey mismatch — possible key substitution attack');
          return null;
        }
        return decryptCommunityKey(encryptedKey, planterPublicKey);
      })
      .then(keyBase64 => {
        if (!keyBase64) return;
        return storeCommunityKey(communityId, keyBase64).then(() => {
          _onCommunityKeyCallbacks.forEach(cb => {
            try { cb(communityId, planterPublicKey); }
            catch (e) { console.error('[sync] onCommunityKey callback threw', e); }
          });
        });
      })
      .catch(err => console.warn('[sync] failed to decrypt community key', err));
  });

  // ── Key request pending (planter only) ────────────────────────────────────
  // The planter's device receives this when a member requests the community key.
  // The planter's UI should approve/deny and call approveCommunityKey().
  relay.on('key-request-pending', (msg) => {
    const reqCommunityId   = msg['communityId']        as string;
    const requesterPublicKey = msg['requesterPublicKey'] as string;
    if (!reqCommunityId || !requesterPublicKey) return;
    _onKeyRequestCallbacks.forEach(cb => {
      try { cb(reqCommunityId, requesterPublicKey); }
      catch (e) { console.error('[sync] onKeyRequest callback threw', e); }
    });
  });

  // ── Contact request pending (author only) ─────────────────────────────────
  // The author's device receives this when a member taps "Contact" on their post.
  relay.on('contact-request-pending', (msg) => {
    const requestId          = msg['requestId']          as string;
    const reqCommunityId     = msg['communityId']        as string;
    const requesterPublicKey = msg['requesterPublicKey'] as string;
    const requesterHandle    = msg['requesterHandle']    as string;
    const postId             = msg['postId']             as string;
    const postTitle          = msg['postTitle']          as string;
    if (!requestId || !reqCommunityId || !requesterPublicKey || !postId) return;
    const req: IncomingContactRequest = {
      requestId, communityId: reqCommunityId, requesterPublicKey,
      requesterHandle: requesterHandle ?? '', postId, postTitle: postTitle ?? '',
    };
    _onContactRequestCallbacks.forEach(cb => {
      try { cb(req); }
      catch (e) { console.error('[sync] onContactRequest callback threw', e); }
    });
  });

  // ── Contact response received (requester side) ─────────────────────────────
  // Arrives when the author approved the request. Decrypt and store locally.
  relay.on('contact-response', (msg) => {
    const postId           = msg['postId']           as string;
    const encryptedContact = msg['encryptedContact'] as string;
    const authorPublicKey  = msg['authorPublicKey']  as string;
    if (!postId || !encryptedContact || !authorPublicKey) return;

    decryptFromSender(encryptedContact, authorPublicKey)
      .then(contact => saveReveal(postId, authorPublicKey, contact))
      .then(() => {
        _onContactResponseCallbacks.forEach(cb => {
          try { cb(postId); }
          catch (e) { console.error('[sync] onContactResponse callback threw', e); }
        });
      })
      .catch(err => console.warn('[sync] failed to decrypt contact response', err));
  });

  // ── Contact declined (requester side) ─────────────────────────────────────
  relay.on('contact-declined', (msg) => {
    const postId = msg['postId'] as string;
    if (!postId) return;
    _onContactDeclinedCallbacks.forEach(cb => {
      try { cb(postId); }
      catch (e) { console.error('[sync] onContactDeclined callback threw', e); }
    });
  });

  relay.start();
}

export function stopSync(): void {
  _webrtc?.stop();
  _webrtc = null;
  _relay?.stop();
  _relay = null;
  _activeCommunityId = null;
  _emitSyncStatus(false);
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
  if (_activeCommunityId !== post.communityId) return;

  // Queue if not yet connected — will flush on next _authed event.
  // If the queue is full, drop the oldest entry to make room.
  if (!_relay?.isAuthed()) {
    if (_pendingPushes.length >= MAX_PENDING_PUSHES) _pendingPushes.shift();
    _pendingPushes.push(post);
    _emitSyncStatus(false);
    return;
  }

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
 * Register a callback for when this device successfully receives and stores a
 * community key. Called after auto-decryption — the key is already in SecureStore.
 * Returns an unsubscribe function.
 */
export function onCommunityKeyReceived(
  cb: (communityId: string, planterPublicKey: string) => void,
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

/**
 * Register a callback for sync status changes (connected/queued).
 * Fires on: relay auth, stopSync, post queued, post flush.
 * Returns an unsubscribe function.
 */
export function onSyncStatusChange(cb: (status: SyncStatus) => void): () => void {
  _onSyncStatusCallbacks.push(cb);
  return () => {
    const i = _onSyncStatusCallbacks.indexOf(cb);
    if (i >= 0) _onSyncStatusCallbacks.splice(i, 1);
  };
}

/** Returns a snapshot of the current sync status. */
export function getSyncStatus(): SyncStatus {
  return { connected: _relay?.isAuthed() ?? false, queued: _pendingPushes.length };
}

// ─── CONTACT SHARING ──────────────────────────────────────────────────────────

/**
 * Send a contact request to the author of a post.
 * No-op if relay is not authenticated.
 */
export function sendContactRequest(
  postId: string,
  postTitle: string,
  authorPublicKey: string,
  communityId: string,
  requestId: string,
  requesterHandle: string,
): void {
  if (!_relay?.isAuthed()) return;
  _relay.sendContactRequest(communityId, authorPublicKey, postId, postTitle, requestId, requesterHandle);
}

/**
 * Author approves a contact request: encrypt contact info for the requester
 * and forward via relay.
 */
export async function approveContactRequest(
  postId: string,
  requestId: string,
  requesterPublicKey: string,
  communityId: string,
  contactInfo: string,
): Promise<void> {
  if (!_relay?.isAuthed()) throw new Error('Not connected to relay');
  const encrypted = await encryptForRecipient(contactInfo, requesterPublicKey);
  _relay.respondToContact(communityId, requesterPublicKey, postId, encrypted, requestId);
}

/**
 * Author declines a contact request.
 * No-op if relay is not authenticated.
 */
export function declineContactRequest(
  postId: string,
  requestId: string,
  requesterPublicKey: string,
  communityId: string,
): void {
  if (!_relay?.isAuthed()) return;
  _relay.declineContact(communityId, requesterPublicKey, postId, requestId);
}

/**
 * Register a callback for incoming contact requests (author only).
 * Returns an unsubscribe function.
 */
export function onContactRequestPending(
  cb: (req: IncomingContactRequest) => void,
): () => void {
  _onContactRequestCallbacks.push(cb);
  return () => {
    const i = _onContactRequestCallbacks.indexOf(cb);
    if (i >= 0) _onContactRequestCallbacks.splice(i, 1);
  };
}

/**
 * Register a callback for when a contact response is received and stored
 * (requester side). Called after auto-decryption — contact is in SQLite.
 * Returns an unsubscribe function.
 */
export function onContactResponse(cb: (postId: string) => void): () => void {
  _onContactResponseCallbacks.push(cb);
  return () => {
    const i = _onContactResponseCallbacks.indexOf(cb);
    if (i >= 0) _onContactResponseCallbacks.splice(i, 1);
  };
}

/**
 * Register a callback for when a contact request was declined.
 * Returns an unsubscribe function.
 */
export function onContactDeclined(cb: (postId: string) => void): () => void {
  _onContactDeclinedCallbacks.push(cb);
  return () => {
    const i = _onContactDeclinedCallbacks.indexOf(cb);
    if (i >= 0) _onContactDeclinedCallbacks.splice(i, 1);
  };
}
