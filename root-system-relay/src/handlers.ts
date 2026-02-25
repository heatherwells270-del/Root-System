// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM RELAY — Message Handlers
//
// Routes every message type through its correct phase.
// The relay's job: verify identity, route messages, hold the buffer.
// It does not read post content, modify data, or make editorial decisions.
//
// Phase 1 — Auth:       challenge-response, session creation
// Phase 2 — Presence:   join community, peer discovery
// Phase 3 — Signaling:  WebRTC offer/answer/ICE passthrough
// Phase 5 — Buffer:     push/pull encrypted post blobs
// Phase 6 — Key distrib: queue + forward community key requests
//
// Phases 4 and 7 are device-to-device (WebRTC data channel).
// The relay never sees those messages.
// ═══════════════════════════════════════════════════════════════════════════

import type WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  verifySignature, canonicalAuth, canonicalNonce,
  generateNonce, isTimestampFresh,
} from './auth.js';
import {
  issueNonce, consumeNonce,
  registerCommunity, getCommunity,
  pushBuffer, pullBuffer, ackBuffer,
  enqueueKeyRequest, getPendingKeyRequests, clearKeyRequest,
} from './store.js';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface Session {
  ws:          WebSocket;
  publicKey:   string | null;   // null until auth completes
  deviceId:    string | null;
  sessionId:   string;
  communityId: string | null;   // null until join
  authedAt:    number | null;
  pendingNonce: string | null;  // nonce issued, waiting for auth
}

// In-memory routing maps
export const sessions    = new Map<string, Session>();          // sessionId → Session
export const communities = new Map<string, Set<string>>();      // communityId → Set<sessionId>

// Rate limiting: publicKey → { windowStart, count }
const rateLimits = new Map<string, { windowStart: number; count: number }>();
const RATE_LIMIT_BUFFER_PUSH = 20;    // per hour per key
const RATE_LIMIT_WINDOW_MS   = 60 * 60 * 1000;

function checkRateLimit(publicKey: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(publicKey);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(publicKey, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_BUFFER_PUSH) return false;
  entry.count++;
  return true;
}

// ─── SEND HELPERS ────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendToSession(sessionId: string, msg: object): void {
  const s = sessions.get(sessionId);
  if (s) send(s.ws, msg);
}

function broadcastToCommunity(communityId: string, msg: object, excludeSessionId?: string): void {
  const members = communities.get(communityId);
  if (!members) return;
  for (const sid of members) {
    if (sid !== excludeSessionId) sendToSession(sid, msg);
  }
}

// ─── CONNECTION LIFECYCLE ────────────────────────────────────────────────────

export function onConnect(ws: WebSocket): Session {
  const sessionId = uuidv4();
  const session: Session = {
    ws, publicKey: null, deviceId: null, sessionId,
    communityId: null, authedAt: null, pendingNonce: null,
  };
  sessions.set(sessionId, session);
  console.log(`[connect] session=${sessionId}`);
  return session;
}

export function onDisconnect(session: Session): void {
  const { sessionId, communityId } = session;
  sessions.delete(sessionId);

  if (communityId) {
    const members = communities.get(communityId);
    if (members) {
      members.delete(sessionId);
      if (members.size === 0) communities.delete(communityId);
    }
    broadcastToCommunity(communityId, {
      v: 1, type: 'peer-left', sessionId,
    });
  }

  console.log(`[disconnect] session=${sessionId} community=${communityId ?? 'none'}`);
}

// ─── MESSAGE ROUTER ──────────────────────────────────────────────────────────

export async function onMessage(session: Session, raw: string): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    send(session.ws, { v: 1, type: 'error', reason: 'invalid JSON' });
    return;
  }

  if (msg['v'] !== 1) {
    send(session.ws, { v: 1, type: 'error', reason: 'unsupported protocol version' });
    return;
  }

  const type = msg['type'] as string;

  // ── Phase 1: Auth ─────────────────────────────────────────────────────────

  if (type === 'hello') {
    await handleHello(session, msg);
    return;
  }

  if (type === 'auth') {
    await handleAuth(session, msg);
    return;
  }

  // All subsequent messages require auth
  if (!session.publicKey) {
    send(session.ws, { v: 1, type: 'error', reason: 'not authenticated' });
    return;
  }

  switch (type) {

    // ── Phase 2: Presence ──────────────────────────────────────────────────
    case 'join':
      handleJoin(session, msg);
      break;

    // ── Phase 3: WebRTC signaling ──────────────────────────────────────────
    case 'offer':
    case 'answer':
    case 'ice':
      handleSignaling(session, msg, type);
      break;

    // ── Phase 5: Post buffer ───────────────────────────────────────────────
    case 'buffer-push':
      handleBufferPush(session, msg);
      break;

    case 'buffer-pull':
      handleBufferPull(session, msg);
      break;

    case 'buffer-item-ack':
      handleBufferItemAck(msg);
      break;

    // ── Phase 6: Community key distribution ───────────────────────────────
    case 'key-request':
      handleKeyRequest(session, msg);
      break;

    case 'key-approve':
      handleKeyApprove(session, msg);
      break;

    default:
      send(session.ws, { v: 1, type: 'error', reason: `unknown message type: ${type}` });
  }
}

// ─── PHASE 1: AUTH ────────────────────────────────────────────────────────────

async function handleHello(session: Session, msg: Record<string, unknown>): Promise<void> {
  const { publicKey, deviceId, timestamp, sig } = msg as {
    publicKey: string; deviceId: string; timestamp: string; sig: string;
  };

  if (!publicKey || !deviceId || !timestamp || !sig) {
    send(session.ws, { v: 1, type: 'auth-failed', reason: 'missing fields' });
    return;
  }

  // Timestamp freshness check — prevents replay of hello signatures
  if (!isTimestampFresh(timestamp)) {
    send(session.ws, { v: 1, type: 'auth-failed', reason: 'timestamp stale or invalid' });
    return;
  }

  // Verify hello signature
  const canonical = canonicalAuth(publicKey, deviceId, timestamp);
  const valid = await verifySignature(canonical, sig, publicKey);
  if (!valid) {
    send(session.ws, { v: 1, type: 'auth-failed', reason: 'hello signature invalid' });
    return;
  }

  // Issue challenge nonce
  const nonce = generateNonce();
  issueNonce(nonce);
  session.pendingNonce = nonce;

  // Store public key tentatively (needed to verify auth response)
  session.publicKey = publicKey;
  session.deviceId  = deviceId;

  send(session.ws, { v: 1, type: 'challenge', nonce });
}

async function handleAuth(session: Session, msg: Record<string, unknown>): Promise<void> {
  const { nonce, sig } = msg as { nonce: string; sig: string };

  if (!nonce || !sig) {
    send(session.ws, { v: 1, type: 'auth-failed', reason: 'missing fields' });
    return;
  }

  // Nonce must match what we issued
  if (session.pendingNonce !== nonce) {
    send(session.ws, { v: 1, type: 'auth-failed', reason: 'nonce mismatch' });
    return;
  }

  // Consume nonce (single-use, within 5-minute window)
  if (!consumeNonce(nonce)) {
    session.publicKey  = null;
    session.deviceId   = null;
    session.pendingNonce = null;
    send(session.ws, { v: 1, type: 'auth-failed', reason: 'nonce expired or already used' });
    return;
  }

  // Verify nonce signature
  const canonical = canonicalNonce(nonce);
  const valid = await verifySignature(canonical, sig, session.publicKey!);
  if (!valid) {
    session.publicKey  = null;
    session.deviceId   = null;
    session.pendingNonce = null;
    send(session.ws, { v: 1, type: 'auth-failed', reason: 'auth signature invalid' });
    return;
  }

  session.authedAt     = Date.now();
  session.pendingNonce = null;

  send(session.ws, { v: 1, type: 'authed', sessionId: session.sessionId });
  console.log(`[auth] key=${session.publicKey!.slice(0, 12)}… session=${session.sessionId}`);
}

// ─── PHASE 2: PRESENCE ────────────────────────────────────────────────────────

function handleJoin(session: Session, msg: Record<string, unknown>): void {
  const { communityId } = msg as { communityId: string };

  if (!communityId) {
    send(session.ws, { v: 1, type: 'error', reason: 'communityId required' });
    return;
  }

  // Leave previous community if switching
  if (session.communityId && session.communityId !== communityId) {
    const prev = communities.get(session.communityId);
    if (prev) {
      prev.delete(session.sessionId);
      broadcastToCommunity(session.communityId, {
        v: 1, type: 'peer-left', sessionId: session.sessionId,
      });
    }
  }

  session.communityId = communityId;

  if (!communities.has(communityId)) communities.set(communityId, new Set());
  communities.get(communityId)!.add(session.sessionId);

  // Register community if new (first device to join creates the record)
  if (!getCommunity(communityId)) {
    registerCommunity(communityId, session.publicKey!);
    console.log(`[community] registered id=${communityId} planter=${session.publicKey!.slice(0, 12)}…`);
  }

  // Send current peer list to the joining device
  const peers = [];
  for (const sid of communities.get(communityId)!) {
    if (sid === session.sessionId) continue;
    const peer = sessions.get(sid);
    if (peer?.publicKey) {
      peers.push({ publicKey: peer.publicKey, deviceId: peer.deviceId, sessionId: sid });
    }
  }
  send(session.ws, { v: 1, type: 'peers', peers });

  // Notify existing peers
  broadcastToCommunity(communityId, {
    v: 1, type: 'peer-joined',
    publicKey: session.publicKey,
    deviceId:  session.deviceId,
    sessionId: session.sessionId,
  }, session.sessionId);

  // Deliver any pending key requests to the planter
  const community = getCommunity(communityId);
  if (community?.planterPublicKey === session.publicKey) {
    const pending = getPendingKeyRequests(communityId);
    for (const req of pending) {
      send(session.ws, {
        v: 1, type: 'key-request-pending',
        communityId,
        requesterPublicKey: req.requesterPublicKey,
      });
    }
  }

  console.log(`[join] key=${session.publicKey!.slice(0, 12)}… community=${communityId} peers=${peers.length}`);
}

// ─── PHASE 3: WEBRTC SIGNALING ────────────────────────────────────────────────

function handleSignaling(
  session: Session,
  msg: Record<string, unknown>,
  type: string
): void {
  const { to } = msg as { to: string };

  if (!to) {
    send(session.ws, { v: 1, type: 'error', reason: `${type}: 'to' field required` });
    return;
  }

  // Route to target session — relay does not inspect SDP or ICE candidates
  const target = sessions.get(to);
  if (!target) {
    send(session.ws, { v: 1, type: 'error', reason: 'peer not found' });
    return;
  }

  // Forward with 'from' added so target knows who sent it
  const forwarded: Record<string, unknown> = { ...msg, from: session.sessionId };
  delete forwarded['to'];
  send(target.ws, forwarded);
}

// ─── PHASE 5: POST BUFFER ─────────────────────────────────────────────────────

function handleBufferPush(session: Session, msg: Record<string, unknown>): void {
  const { communityId, encryptedBlob, pushedAt } = msg as {
    communityId: string; encryptedBlob: string; pushedAt: string;
  };

  if (!communityId || !encryptedBlob || !pushedAt) {
    send(session.ws, { v: 1, type: 'error', reason: 'buffer-push: missing fields' });
    return;
  }

  // Rate limit per public key
  if (!checkRateLimit(session.publicKey!)) {
    send(session.ws, { v: 1, type: 'error', reason: 'rate limit exceeded' });
    return;
  }

  const bufferId = uuidv4();
  pushBuffer(bufferId, communityId, encryptedBlob, pushedAt);
  send(session.ws, { v: 1, type: 'buffer-ack', bufferId });
}

function handleBufferPull(session: Session, msg: Record<string, unknown>): void {
  const { communityId, since } = msg as { communityId: string; since: string };

  if (!communityId || !since) {
    send(session.ws, { v: 1, type: 'error', reason: 'buffer-pull: missing fields' });
    return;
  }

  const items = pullBuffer(communityId, since);
  send(session.ws, {
    v: 1, type: 'buffer-items',
    items: items.map(i => ({
      bufferId:      i.id,
      encryptedBlob: i.encryptedBlob,
      pushedAt:      i.pushedAt,
    })),
  });
}

function handleBufferItemAck(msg: Record<string, unknown>): void {
  const { bufferId } = msg as { bufferId: string };
  if (bufferId) ackBuffer(bufferId);
}

// ─── PHASE 6: COMMUNITY KEY DISTRIBUTION ─────────────────────────────────────

function handleKeyRequest(session: Session, msg: Record<string, unknown>): void {
  const { communityId } = msg as { communityId: string };

  if (!communityId) {
    send(session.ws, { v: 1, type: 'error', reason: 'key-request: communityId required' });
    return;
  }

  const community = getCommunity(communityId);
  if (!community) {
    send(session.ws, { v: 1, type: 'error', reason: 'community not found' });
    return;
  }

  const planterKey = community.planterPublicKey;

  // Find planter's active session
  let planterSession: Session | undefined;
  const members = communities.get(communityId);
  if (members) {
    for (const sid of members) {
      const s = sessions.get(sid);
      if (s?.publicKey === planterKey) { planterSession = s; break; }
    }
  }

  if (planterSession) {
    // Planter is online — deliver request immediately
    send(planterSession.ws, {
      v: 1, type: 'key-request-pending',
      communityId,
      requesterPublicKey: session.publicKey,
    });
  } else {
    // Planter offline — queue for when they reconnect
    enqueueKeyRequest(communityId, session.publicKey!);
  }
}

function handleKeyApprove(session: Session, msg: Record<string, unknown>): void {
  const { communityId, requesterPublicKey, encryptedKey } = msg as {
    communityId: string; requesterPublicKey: string; encryptedKey: string;
  };

  if (!communityId || !requesterPublicKey || !encryptedKey) {
    send(session.ws, { v: 1, type: 'error', reason: 'key-approve: missing fields' });
    return;
  }

  // Verify sender is the planter for this community
  const community = getCommunity(communityId);
  if (!community || community.planterPublicKey !== session.publicKey) {
    send(session.ws, { v: 1, type: 'error', reason: 'only the community planter can approve keys' });
    return;
  }

  // Find the requester's session and deliver
  let delivered = false;
  const members = communities.get(communityId);
  if (members) {
    for (const sid of members) {
      const s = sessions.get(sid);
      if (s?.publicKey === requesterPublicKey) {
        send(s.ws, { v: 1, type: 'community-key', communityId, encryptedKey });
        delivered = true;
        break;
      }
    }
  }

  // Clear from queue whether or not they're online right now
  clearKeyRequest(communityId, requesterPublicKey);

  if (!delivered) {
    // Requester went offline — they'll re-request when they reconnect
    console.log(`[key-approve] requester offline, key not delivered community=${communityId}`);
  }
}
