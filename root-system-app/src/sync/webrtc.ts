// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — WebRTC Peer Manager (Phase 4)
//
// Device-to-device sync over WebRTC data channels. When two community members
// are online at the same time, this syncs posts directly without going through
// the relay buffer — faster, more resilient, works on local networks even if
// the relay is down.
//
// REQUIRES: react-native-webrtc + expo prebuild
//   → Not available in Expo Go. The try/catch import below degrades gracefully —
//     the app runs in relay-only mode if the native module is absent.
//
// Architecture:
//   - One RTCPeerConnection per active peer session
//   - Glare resolved by public key comparison (higher key = initiator)
//   - Data channel: rs-sync-v1
//   - Sync protocol: watermark exchange + encrypted post blob transfer
//   - Posts travel as the same AES-256-GCM blobs used in the relay buffer
//     (community key encrypts before sending, decrypts on receive)
//
// Signaling:
//   - offer/answer/ice messages routed through the relay (already implemented)
//   - relay.ts has sendOffer(), sendAnswer(), sendIce() — used directly here
// ═══════════════════════════════════════════════════════════════════════════

import { encryptForBuffer, decryptFromBuffer } from '../crypto/encrypt';
import { upsertPost } from '../db/posts';
import { getPostsSince } from '../db/posts';
import { getLastPullAt } from '../db/sync';
import type { RelayClient } from './relay';
import type { Post } from '../models/types';

// ─── GRACEFUL DEGRADATION ─────────────────────────────────────────────────────
// Import react-native-webrtc at runtime so the module loads in Expo Go.
// RTCPeerConnection will be null if the native module is not compiled in.

let RTCPeerConnection: any   = null;
let RTCSessionDescription: any = null;
let RTCIceCandidate: any      = null;

try {
  const w = require('react-native-webrtc');
  RTCPeerConnection    = w.RTCPeerConnection;
  RTCSessionDescription = w.RTCSessionDescription;
  RTCIceCandidate      = w.RTCIceCandidate;
} catch {
  // Expo Go or no native build — WebRTC unavailable. Relay buffer is the fallback.
}

export function webRTCAvailable(): boolean {
  return RTCPeerConnection !== null;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const DATA_CHANNEL_LABEL = 'rs-sync-v1';

// ─── PROTOCOL MESSAGES ────────────────────────────────────────────────────────

type SyncMsg =
  | { type: 'watermark-request'; since: string }
  | { type: 'post-blob'; blob: string }
  | { type: 'done' };

// ─── WEBRTC PEER MANAGER ──────────────────────────────────────────────────────

interface PeerState {
  conn:    any; // RTCPeerConnection
  channel: any | null; // RTCDataChannel (initiator creates it; responder gets it via ondatachannel)
}

export class WebRTCPeerManager {
  private _peers    = new Map<string, PeerState>(); // sessionId → state
  private _relay:     RelayClient;
  private _myPubKey:  string;
  private _communityId: string;
  private _getKey:  () => Promise<string | null>;

  constructor(
    relay: RelayClient,
    myPublicKey: string,
    communityId: string,
    getCommunityKey: () => Promise<string | null>,
  ) {
    this._relay       = relay;
    this._myPubKey    = myPublicKey;
    this._communityId = communityId;
    this._getKey      = getCommunityKey;
  }

  // ── Called with the peer list from the relay 'peers' message ────────────────
  initFromPeerList(peers: Array<{ sessionId: string; publicKey: string }>): void {
    if (!webRTCAvailable()) return;
    for (const peer of peers) {
      if (!this._peers.has(peer.sessionId)) {
        this._maybeConnect(peer.sessionId, peer.publicKey);
      }
    }
  }

  // ── Called when a new peer joins via relay 'peer-joined' message ─────────────
  onPeerJoined(sessionId: string, publicKey: string): void {
    if (!webRTCAvailable()) return;
    if (!this._peers.has(sessionId)) {
      this._maybeConnect(sessionId, publicKey);
    }
  }

  // ── Relay signaling: incoming offer ─────────────────────────────────────────
  async onOffer(fromSessionId: string, sdp: string): Promise<void> {
    if (!webRTCAvailable()) return;
    try {
      let state = this._peers.get(fromSessionId);
      if (!state) {
        state = this._createPeer(fromSessionId, false);
      }
      const conn = state.conn;
      await conn.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      this._relay.sendAnswer(fromSessionId, answer.sdp);
    } catch (e) {
      console.warn('[webrtc] onOffer failed', e);
      this._peers.delete(fromSessionId);
    }
  }

  // ── Relay signaling: incoming answer ────────────────────────────────────────
  async onAnswer(fromSessionId: string, sdp: string): Promise<void> {
    if (!webRTCAvailable()) return;
    try {
      const state = this._peers.get(fromSessionId);
      if (state) {
        await state.conn.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp }),
        );
      }
    } catch (e) {
      console.warn('[webrtc] onAnswer failed', e);
    }
  }

  // ── Relay signaling: incoming ICE candidate ──────────────────────────────────
  async onIce(fromSessionId: string, candidate: RTCIceCandidateInit): Promise<void> {
    if (!webRTCAvailable()) return;
    try {
      const state = this._peers.get(fromSessionId);
      if (state) {
        await state.conn.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (e) {
      console.warn('[webrtc] onIce failed', e);
    }
  }

  // ── Tear down all peer connections ───────────────────────────────────────────
  stop(): void {
    this._peers.forEach(state => {
      try { state.conn.close(); } catch { /* already closed */ }
    });
    this._peers.clear();
  }

  // ─── PRIVATE ────────────────────────────────────────────────────────────────

  /**
   * Glare resolution: the peer with the lexicographically higher public key
   * is the initiator. The other peer waits for an offer.
   * This is deterministic — both sides agree without coordination.
   */
  private _maybeConnect(sessionId: string, theirPublicKey: string): void {
    const iAmInitiator = this._myPubKey > theirPublicKey;
    if (iAmInitiator) {
      this._createPeerAndOffer(sessionId);
    } else {
      // We are the responder — just register the peer slot and wait for their offer
      this._createPeer(sessionId, false);
    }
  }

  private _createPeer(sessionId: string, isInitiator: boolean): PeerState {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const state: PeerState = { conn, channel: null };
    this._peers.set(sessionId, state);

    conn.onicecandidate = (e: any) => {
      if (e.candidate) {
        this._relay.sendIce(sessionId, e.candidate.toJSON());
      }
    };

    conn.onconnectionstatechange = () => {
      const s = conn.connectionState;
      if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        this._peers.delete(sessionId);
      }
    };

    if (!isInitiator) {
      conn.ondatachannel = (e: any) => {
        state.channel = e.channel;
        this._attachDataChannelHandlers(e.channel);
      };
    }

    return state;
  }

  private async _createPeerAndOffer(sessionId: string): Promise<void> {
    try {
      const state = this._createPeer(sessionId, true);
      const channel = state.conn.createDataChannel(DATA_CHANNEL_LABEL);
      state.channel = channel;
      this._attachDataChannelHandlers(channel);

      const offer = await state.conn.createOffer();
      await state.conn.setLocalDescription(offer);
      this._relay.sendOffer(sessionId, offer.sdp);
    } catch (e) {
      console.warn('[webrtc] createPeerAndOffer failed', e);
      this._peers.delete(sessionId);
    }
  }

  private _attachDataChannelHandlers(channel: any): void {
    channel.onopen = () => {
      void this._onChannelOpen(channel);
    };

    channel.onmessage = (e: any) => {
      void this._onChannelMessage(e.data as string);
    };

    channel.onerror = (e: any) => {
      console.warn('[webrtc] data channel error', e);
    };
  }

  private async _onChannelOpen(channel: any): Promise<void> {
    try {
      const since = await getLastPullAt(this._communityId);
      const msg: SyncMsg = { type: 'watermark-request', since: since ?? '' };
      channel.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('[webrtc] channel open handler failed', e);
    }
  }

  private async _onChannelMessage(raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw) as SyncMsg;

      if (msg.type === 'watermark-request') {
        // Peer wants posts newer than msg.since — send our posts to them
        const communityKey = await this._getKey();
        if (!communityKey) return;

        const posts = await getPostsSince(this._communityId, msg.since);
        // Find the data channel to reply on (the one that sent this message)
        // We send on whichever channel is open (there's only one per peer pair)
        const openChannel = this._findOpenChannel();
        if (!openChannel) return;

        for (const post of posts) {
          const json = JSON.stringify(post);
          const blob = await encryptForBuffer(json, communityKey);
          const outMsg: SyncMsg = { type: 'post-blob', blob };
          openChannel.send(JSON.stringify(outMsg));
        }
        const done: SyncMsg = { type: 'done' };
        openChannel.send(JSON.stringify(done));

      } else if (msg.type === 'post-blob') {
        const communityKey = await this._getKey();
        if (!communityKey) return;
        try {
          const json = await decryptFromBuffer(msg.blob, communityKey);
          const post = JSON.parse(json) as Post;
          await upsertPost(post);
        } catch (e) {
          console.warn('[webrtc] failed to decrypt/upsert peer post', e);
        }

      } else if (msg.type === 'done') {
        // Peer has finished sending — nothing to do, we keep listening
      }
    } catch (e) {
      console.warn('[webrtc] channel message handler failed', e);
    }
  }

  private _findOpenChannel(): any | null {
    for (const state of this._peers.values()) {
      if (state.channel?.readyState === 'open') return state.channel;
    }
    return null;
  }
}
