// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Keypair Management
//
// Ed25519 keypairs. Your public key is your identity on the network.
// Your private key never leaves this file — it goes to SecureStore and
// comes back only when signing. It is never logged, never serialized
// into state, never put in a variable that lives longer than needed.
//
// Dependency: @noble/ed25519 (pure JS, auditable, no native module)
// ═══════════════════════════════════════════════════════════════════════════

import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { gcm } from '@noble/ciphers/aes';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { PublicKeyHex, Signature } from '../models/types';

// @noble/ed25519 v3 requires sha512 to be injected for React Native —
// the default hashes.sha512Async uses crypto.subtle (Web Crypto), which
// doesn't exist in React Native. Inject the pure-JS @noble/hashes sha512
// into ed.hashes (the object the library actually reads from).
(ed.hashes as Record<string, unknown>)['sha512'] =
  (msg: Uint8Array) => sha512(msg);
(ed.hashes as Record<string, unknown>)['sha512Async'] =
  (msg: Uint8Array) => Promise.resolve(sha512(msg));

const SECURE_STORE_KEY = 'rs_private_key';

// ─── HELPERS ───────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hexToBytes: odd-length hex string (${hex.length})`);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ─── KEY GENERATION ────────────────────────────────────────────────────────

/**
 * Generate a new Ed25519 keypair. Called once on first launch.
 * Private key goes straight to SecureStore — never returned to caller.
 * Returns only the public key.
 */
export async function generateKeypair(): Promise<PublicKeyHex> {
  // Generate 32 random bytes using the OS crypto RNG
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const privateKey = new Uint8Array(randomBytes);
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  // Store private key in SecureStore — hardware-backed on supported devices
  await SecureStore.setItemAsync(SECURE_STORE_KEY, bytesToHex(privateKey));

  return bytesToHex(publicKey);
}

/**
 * Returns true if a keypair exists on this device.
 */
export async function hasKeypair(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  return stored !== null;
}

/**
 * Derives the public key from the stored private key.
 * Used to recover publicKey if somehow lost from SQLite.
 */
export async function getPublicKey(): Promise<PublicKeyHex | null> {
  const privateHex = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  if (!privateHex) return null;
  const publicKey = await ed.getPublicKeyAsync(hexToBytes(privateHex));
  return bytesToHex(publicKey);
}

// ─── SIGNING ───────────────────────────────────────────────────────────────

/**
 * Sign a message with this device's private key.
 * message should be a canonical string representation of the data being signed.
 */
export async function sign(message: string): Promise<Signature> {
  const privateHex = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  if (!privateHex) throw new Error('No private key found. Identity not initialized.');

  const msgBytes = new TextEncoder().encode(message);
  const sig = await ed.signAsync(msgBytes, hexToBytes(privateHex));
  return bytesToHex(sig);
}

/**
 * Verify a signature against a public key.
 * Returns true if the signature is valid.
 */
export async function verify(
  message: string,
  signature: Signature,
  publicKey: PublicKeyHex
): Promise<boolean> {
  try {
    const msgBytes = new TextEncoder().encode(message);
    return await ed.verifyAsync(hexToBytes(signature), msgBytes, hexToBytes(publicKey));
  } catch {
    return false;
  }
}

// ─── CANONICAL MESSAGE FORMATS ─────────────────────────────────────────────
// These functions produce the exact string that gets signed.
// Canonical = deterministic = same input always produces same string.
// Both signer and verifier must use the same canonical function.

export function canonicalPost(post: {
  id: string; communityId: string; type: string; title: string;
  body: string; authorPublicKey: string; createdAt: string;
}): string {
  return `post:${post.id}:${post.communityId}:${post.type}:${post.title}:${post.body}:${post.authorPublicKey}:${post.createdAt}`;
}

export function canonicalExchange(exchange: {
  id: string; communityId: string; fromPublicKey: string;
  toPublicKey: string; hours: number; createdAt: string;
}): string {
  return `exchange:${exchange.id}:${exchange.communityId}:${exchange.fromPublicKey}:${exchange.toPublicKey}:${exchange.hours}:${exchange.createdAt}`;
}

export function canonicalAuth(publicKey: string, deviceId: string, timestamp: string): string {
  return `auth:${publicKey}:${deviceId}:${timestamp}`;
}

export function canonicalNonce(nonce: string): string {
  return `nonce:${nonce}`;
}

export function canonicalCommunity(community: {
  id: string; name: string; planterPublicKey: string; createdAt: string;
}): string {
  return `community:${community.id}:${community.name}:${community.planterPublicKey}:${community.createdAt}`;
}

export function canonicalTombstone(postId: string, authorPublicKey: string): string {
  return `tombstone:${postId}:${authorPublicKey}`;
}

// ─── RECOVERY KEY ──────────────────────────────────────────────────────────

/**
 * Encrypt this device's private key with a user-supplied passphrase and return
 * a portable backup string that can be saved anywhere (password manager,
 * printed QR, etc.).
 *
 * Format: rsrc_v1:<base64 salt>:<base64 nonce+ciphertext>
 *   - salt  (16 bytes) — random, used for PBKDF2 key derivation
 *   - nonce (12 bytes) — random, prepended to ciphertext
 *   - ciphertext + GCM auth tag (32 + 16 bytes)
 *
 * Key derivation: PBKDF2-SHA256, 100 000 iterations, 32-byte output.
 * Encryption: AES-256-GCM (tag appended by noble/ciphers).
 */
export async function exportRecoveryKey(passphrase: string): Promise<string> {
  const privateKeyHex = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  if (!privateKeyHex) throw new Error('No private key found. Identity not initialized.');

  const saltBytes  = new Uint8Array(await Crypto.getRandomBytesAsync(16));
  const nonceBytes = new Uint8Array(await Crypto.getRandomBytesAsync(12));

  const derivedKey  = pbkdf2(sha256, passphrase, saltBytes, { c: 100_000, dkLen: 32 });
  const cipher      = gcm(derivedKey, nonceBytes);
  const ciphertext  = cipher.encrypt(new TextEncoder().encode(privateKeyHex));

  // Prepend nonce to ciphertext so the restore function has everything in one blob
  const combined = new Uint8Array(nonceBytes.length + ciphertext.length);
  combined.set(nonceBytes, 0);
  combined.set(ciphertext, nonceBytes.length);

  const saltB64    = btoa(String.fromCharCode(...saltBytes));
  const combinedB64 = btoa(String.fromCharCode(...combined));
  return `rsrc_v1:${saltB64}:${combinedB64}`;
}

/**
 * Restore a private key from a backup string produced by exportRecoveryKey.
 * Stores the key in SecureStore and returns the derived public key.
 * Throws if the backup string is malformed or the passphrase is wrong.
 */
export async function restoreFromRecoveryKey(
  backupStr: string,
  passphrase: string,
): Promise<PublicKeyHex> {
  const parts = backupStr.trim().split(':');
  if (parts.length !== 3 || parts[0] !== 'rsrc_v1') {
    throw new Error('Invalid recovery key format. Make sure you pasted the full string.');
  }

  const saltBytes  = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const combined   = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const nonceBytes = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const derivedKey = pbkdf2(sha256, passphrase, saltBytes, { c: 100_000, dkLen: 32 });
  const cipher     = gcm(derivedKey, nonceBytes);

  let privateKeyHex: string;
  try {
    privateKeyHex = new TextDecoder().decode(cipher.decrypt(ciphertext));
  } catch {
    throw new Error('Incorrect passphrase or corrupted backup.');
  }

  // Validate: must be exactly 64 lowercase hex characters (32 bytes)
  if (!/^[0-9a-f]{64}$/.test(privateKeyHex)) {
    throw new Error('Incorrect passphrase or corrupted backup.');
  }

  await SecureStore.setItemAsync(SECURE_STORE_KEY, privateKeyHex);
  const publicKey = await ed.getPublicKeyAsync(hexToBytes(privateKeyHex));
  return bytesToHex(publicKey);
}

// ─── DEVICE ID ─────────────────────────────────────────────────────────────

/**
 * Generate a stable device ID. Separate from the keypair — identifies
 * this installation, used for vector clocks and rate limiting.
 */
export async function generateDeviceId(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  const hex = bytesToHex(new Uint8Array(bytes));
  // Format as UUID-like string for readability
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
