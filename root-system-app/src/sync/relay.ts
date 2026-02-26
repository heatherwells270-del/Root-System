// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Relay Client
//
// WebSocket client that speaks the relay protocol (see models/protocol.ts).
//
// Lifecycle:
//   start() → connects → auto-authenticates → emits '_authed'
//   stop()  → closes and does not reconnect
//
// Reconnects automatically with exponential backoff (2s → 30s).
// All send methods are safe to call before auth — they're no-ops if the
// socket isn't open.
// ═══════════════════════════════════════════════════════════════════════════

import { PROTOCOL_VERSION } from '../models/protocol';
import { sign, canonicalAuth, canonicalNonce } from '../crypto/keypair';

type MessageHandler = (msg: Record<string, unknown>) => void;

export class RelayClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectDelay = 2000;   // ms; doubles each attempt, caps at 30 000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private handlers = new Map<string, MessageHandler[]>();

  constructor(
    private readonly url: string,
    private readonly publicKey: string,
    private readonly deviceId: string,
  ) {}

  // ─── LIFECYCLE ─────────────────────────────────────────────────────────────

  start(): void {
    this.stopped = false;
    this._connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this._heartbeatInterval) { clearInterval(this._heartbeatInterval); this._heartbeatInterval = null; }
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
  }

  isAuthed(): boolean { return this.sessionId !== null; }
  getSessionId(): string | null { return this.sessionId; }

  // ─── CONNECTION ─────────────────────────────────────────────────────────────

  private _connect(): void {
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectDelay = 2000;
        void this._authenticate();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;
          this._dispatch(String(msg['type'] ?? ''), msg);
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        this.sessionId = null;
        if (!this.stopped) this._scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose fires after onerror — reconnect happens there
      };
    } catch {
      if (!this.stopped) this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => { this._connect(); }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
  }

  // ─── AUTH HANDSHAKE ─────────────────────────────────────────────────────────
  //
  // hello → challenge → auth → authed
  //
  // Both signatures use canonical strings from keypair.ts so they match
  // the relay's verifier exactly.

  private async _authenticate(): Promise<void> {
    const timestamp = new Date().toISOString();
    const helloSig = await sign(canonicalAuth(this.publicKey, this.deviceId, timestamp));

    this._send({
      v: PROTOCOL_VERSION, type: 'hello',
      publicKey: this.publicKey, deviceId: this.deviceId, timestamp, sig: helloSig,
    });

    const challenge = await this._once('challenge', 10_000) as { nonce: string } | null;
    if (!challenge?.nonce) return;

    const nonceSig = await sign(canonicalNonce(challenge.nonce));
    this._send({ v: PROTOCOL_VERSION, type: 'auth', nonce: challenge.nonce, sig: nonceSig });

    const authed = await this._once('authed', 10_000) as { sessionId: string } | null;
    if (!authed?.sessionId) return;

    this.sessionId = authed.sessionId;
    this._dispatch('_authed', authed);   // internal event — SyncManager listens here

    // Keep-alive: ping every 25s to prevent idle-timeout disconnects.
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    this._heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this._send({ v: PROTOCOL_VERSION, type: 'ping' });
      }
    }, 25_000);
  }

  // ─── SEND ───────────────────────────────────────────────────────────────────

  private _send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ─── EVENT SYSTEM ──────────────────────────────────────────────────────────

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
    return () => {
      const arr = this.handlers.get(type);
      if (arr) {
        const i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
      }
    };
  }

  private _dispatch(type: string, msg: Record<string, unknown>): void {
    const arr = this.handlers.get(type);
    if (arr) {
      arr.slice().forEach(fn => {
        try { fn(msg); }
        catch (e) { console.error('[relay] message handler threw', e); }
      });
    }
  }

  /** Wait for the next message of a given type. Returns null on timeout. */
  private _once(type: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
    return new Promise(resolve => {
      let off: () => void;
      const timer = setTimeout(() => { off?.(); resolve(null); }, timeoutMs);
      off = this.on(type, (msg) => { clearTimeout(timer); resolve(msg); });
    });
  }

  // ─── PHASE 2: PRESENCE ─────────────────────────────────────────────────────

  join(communityId: string, vectorClock: Record<string, number>): void {
    if (!this.sessionId) return;
    this._send({
      v: PROTOCOL_VERSION, type: 'join',
      communityId, sessionId: this.sessionId, vectorClock,
    });
  }

  // ─── PHASE 3: WEBRTC SIGNALING ─────────────────────────────────────────────
  // Relay passes these through unchanged. Device-to-device (Phase 4) happens
  // over the resulting WebRTC data channel — not through the relay.

  sendOffer(to: string, sdp: string): void {
    this._send({ v: PROTOCOL_VERSION, type: 'offer', to, sdp });
  }

  sendAnswer(to: string, sdp: string): void {
    this._send({ v: PROTOCOL_VERSION, type: 'answer', to, sdp });
  }

  sendIce(to: string, candidate: string): void {
    this._send({ v: PROTOCOL_VERSION, type: 'ice', to, candidate });
  }

  // ─── PHASE 5: BUFFER ───────────────────────────────────────────────────────

  pushToBuffer(communityId: string, encryptedBlob: string): void {
    // pushedAt is set server-side — never trust the client's clock for buffer ordering
    this._send({
      v: PROTOCOL_VERSION, type: 'buffer-push',
      communityId, encryptedBlob,
    });
  }

  pullBuffer(communityId: string, since: string): void {
    this._send({ v: PROTOCOL_VERSION, type: 'buffer-pull', communityId, since });
  }

  ackBufferItem(bufferId: string): void {
    this._send({ v: PROTOCOL_VERSION, type: 'buffer-item-ack', bufferId });
  }

  // ─── PHASE 6: KEY DISTRIBUTION ─────────────────────────────────────────────

  async requestCommunityKey(communityId: string): Promise<void> {
    const sig = await sign(`key-request:${communityId}:${this.publicKey}`);
    this._send({
      v: PROTOCOL_VERSION, type: 'key-request',
      communityId, publicKey: this.publicKey, sig,
    });
  }

  approveCommunityKey(
    communityId: string,
    requesterPublicKey: string,
    encryptedKey: string,
  ): void {
    this._send({
      v: PROTOCOL_VERSION, type: 'key-approve',
      communityId, requesterPublicKey, encryptedKey,
    });
  }

  // ─── PHASE 7: CONTACT REVEAL ───────────────────────────────────────────────

  sendContactRequest(
    communityId: string,
    authorPublicKey: string,
    postId: string,
    postTitle: string,
    requestId: string,
    requesterHandle: string,
  ): void {
    this._send({
      v: PROTOCOL_VERSION, type: 'contact-request',
      communityId, authorPublicKey, postId,
      postTitle, requesterHandle,
      requestId,
    });
  }

  respondToContact(
    communityId: string,
    requesterPublicKey: string,
    postId: string,
    encryptedContact: string,
    requestId: string,
  ): void {
    this._send({
      v: PROTOCOL_VERSION, type: 'contact-respond',
      communityId, requesterPublicKey, postId, encryptedContact, requestId,
    });
  }

  declineContact(
    communityId: string,
    requesterPublicKey: string,
    postId: string,
    requestId: string,
  ): void {
    this._send({
      v: PROTOCOL_VERSION, type: 'contact-decline',
      communityId, requesterPublicKey, postId, requestId,
    });
  }
}
