// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM RELAY — Auth
//
// Ed25519 signature verification + challenge-response helpers.
// The relay verifies signatures but never generates them.
// ═══════════════════════════════════════════════════════════════════════════

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Inject sha512 for Node.js (same pattern as the React Native app)
(ed.etc as Record<string, unknown>)['sha512Sync'] =
  (...msgs: Uint8Array[]) => sha512(ed.etc.concatBytes(...msgs));
(ed.etc as Record<string, unknown>)['sha512Async'] =
  (...msgs: Uint8Array[]) => Promise.resolve(sha512(ed.etc.concatBytes(...msgs)));

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── CANONICAL MESSAGES ──────────────────────────────────────────────────────
// Must match keypair.ts on the client exactly.

export function canonicalAuth(publicKey: string, deviceId: string, timestamp: string): string {
  return `auth:${publicKey}:${deviceId}:${timestamp}`;
}

export function canonicalNonce(nonce: string): string {
  return `nonce:${nonce}`;
}

// ─── VERIFICATION ────────────────────────────────────────────────────────────

export async function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    const msgBytes = new TextEncoder().encode(message);
    return await ed.verifyAsync(hexToBytes(signature), msgBytes, hexToBytes(publicKey));
  } catch {
    return false;
  }
}

// ─── NONCE GENERATION ────────────────────────────────────────────────────────

export function generateNonce(): string {
  // 32 cryptographically random bytes → hex string
  // globalThis.crypto is available in Node 19+ and all modern runtimes.
  // The relay requires Node 19+ (package.json engines), so no fallback needed.
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

// ─── TIMESTAMP VALIDATION ────────────────────────────────────────────────────

/**
 * Timestamps in hello messages must be within 60 seconds of server time.
 * Prevents replay attacks on hello signatures.
 */
export function isTimestampFresh(timestamp: string): boolean {
  const ts = new Date(timestamp).getTime();
  if (isNaN(ts)) return false;
  const age = Math.abs(Date.now() - ts);
  return age <= 60 * 1000;
}
