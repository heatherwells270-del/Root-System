// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Encryption
//
// Two use cases:
//   1. Contact info reveal — encrypted to recipient's public key
//      (X25519 key agreement + AES-256-GCM)
//   2. Post buffer — encrypted with community symmetric key
//      (AES-256-GCM)
//
// Nothing in this file is novel. We use standard primitives correctly.
// ═══════════════════════════════════════════════════════════════════════════

import { gcm } from '@noble/ciphers/aes.js';
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { PublicKeyHex } from '../models/types';

const PRIVATE_KEY_STORE = 'rs_private_key';

// ─── HELPERS ───────────────────────────────────────────────────────────────

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

function bytesToBase64(bytes: Uint8Array): string {
  // btoa is available in React Native (Hermes). Buffer is NOT globally available
  // without explicit polyfill, so we use a loop-based approach instead.
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function randomBytes(n: number): Promise<Uint8Array> {
  const raw = await Crypto.getRandomBytesAsync(n);
  return new Uint8Array(raw);
}

// ─── CONTACT INFO — PUBLIC KEY ENCRYPTION ─────────────────────────────────
//
// Protocol:
//   1. Derive shared secret via X25519 key agreement
//      (Ed25519 keys are converted to X25519 for this — standard practice)
//   2. Derive encryption key via HKDF-SHA256
//   3. Encrypt with AES-256-GCM
//   4. Output: base64(nonce + ciphertext + tag)

/**
 * Encrypt contact info for a specific recipient.
 * Only the holder of recipientPublicKey's corresponding private key can decrypt.
 */
export async function encryptForRecipient(
  plaintext: string,
  recipientPublicKey: PublicKeyHex
): Promise<string> {
  // Get our private key for key agreement
  const ourPrivateHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
  if (!ourPrivateHex) throw new Error('No private key found.');

  // Convert Ed25519 keys to X25519 (Curve25519 Montgomery form) for ECDH.
  // Ed25519 and X25519 use different curve representations (twisted Edwards vs
  // Montgomery) even though they share the same underlying field. The birational
  // map between them is applied via ed25519.utils (noble/curves v2 API).
  const ourX25519Private  = ed25519.utils.toMontgomerySecret(hexToBytes(ourPrivateHex));
  const theirX25519Public = ed25519.utils.toMontgomery(hexToBytes(recipientPublicKey));

  // X25519 shared secret
  const sharedSecret = x25519.getSharedSecret(ourX25519Private, theirX25519Public);

  // Derive encryption key with HKDF
  const encKey = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode('rs-contact-v1'), 32);

  // Encrypt
  const nonce = await randomBytes(12);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const cipher = gcm(encKey, nonce);
  const ciphertext = cipher.encrypt(plaintextBytes);

  // Pack: nonce(12) + ciphertext+tag
  const packed = new Uint8Array(12 + ciphertext.length);
  packed.set(nonce, 0);
  packed.set(ciphertext, 12);

  return bytesToBase64(packed);
}

/**
 * Decrypt contact info sent to us.
 * Requires the sender's public key to reconstruct the shared secret.
 */
export async function decryptFromSender(
  encryptedBase64: string,
  senderPublicKey: PublicKeyHex
): Promise<string> {
  const ourPrivateHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
  if (!ourPrivateHex) throw new Error('No private key found.');

  const packed = base64ToBytes(encryptedBase64);
  const nonce = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  const ourX25519Private  = ed25519.utils.toMontgomerySecret(hexToBytes(ourPrivateHex));
  const theirX25519Public = ed25519.utils.toMontgomery(hexToBytes(senderPublicKey));

  const sharedSecret = x25519.getSharedSecret(ourX25519Private, theirX25519Public);
  const encKey = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode('rs-contact-v1'), 32);

  const cipher = gcm(encKey, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ─── POST BUFFER — COMMUNITY KEY ENCRYPTION ───────────────────────────────
//
// The community key is a 32-byte AES-256-GCM symmetric key.
// Posts are encrypted with it before going to the relay buffer.
// The relay holds the ciphertext and cannot read it.

/**
 * Encrypt a post (as JSON string) for the relay buffer.
 * Uses the community's shared symmetric key.
 */
export async function encryptForBuffer(
  postJson: string,
  communityKeyBase64: string
): Promise<string> {
  const key = base64ToBytes(communityKeyBase64);
  const nonce = await randomBytes(12);
  const plaintext = new TextEncoder().encode(postJson);

  const cipher = gcm(key, nonce);
  const ciphertext = cipher.encrypt(plaintext);

  const packed = new Uint8Array(12 + ciphertext.length);
  packed.set(nonce, 0);
  packed.set(ciphertext, 12);

  return bytesToBase64(packed);
}

/**
 * Decrypt a post from the relay buffer.
 */
export async function decryptFromBuffer(
  encryptedBase64: string,
  communityKeyBase64: string
): Promise<string> {
  const key = base64ToBytes(communityKeyBase64);
  const packed = base64ToBytes(encryptedBase64);
  const nonce = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  const cipher = gcm(key, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ─── COMMUNITY KEY — DISTRIBUTION ENCRYPTION ──────────────────────────────
//
// When a planter distributes the community key to a new member,
// they encrypt it with the member's public key. Same X25519+AES scheme.

/**
 * Encrypt the community key for delivery to a new member.
 * Called by the planter's device.
 */
export async function encryptCommunityKeyFor(
  communityKeyBase64: string,
  recipientPublicKey: PublicKeyHex
): Promise<string> {
  return encryptForRecipient(communityKeyBase64, recipientPublicKey);
}

/**
 * Decrypt the community key after receiving it from the planter.
 * Called by the new member's device.
 */
export async function decryptCommunityKey(
  encryptedBase64: string,
  planterPublicKey: PublicKeyHex
): Promise<string> {
  return decryptFromSender(encryptedBase64, planterPublicKey);
}

// ─── COMMUNITY KEY GENERATION ──────────────────────────────────────────────

/**
 * Generate a new community symmetric key.
 * Called once when a community is created.
 */
export async function generateCommunityKey(): Promise<string> {
  const key = await randomBytes(32);
  return bytesToBase64(key);
}

// ─── HASHING ───────────────────────────────────────────────────────────────

/**
 * hash(publicKey + postId) — used for flaggedBy sets.
 * Prevents double-flagging without exposing who flagged.
 */
export function hashFlagIdentity(publicKey: PublicKeyHex, targetId: string): string {
  const input = new TextEncoder().encode(`flag:${publicKey}:${targetId}`);
  return bytesToHex(sha256(input));
}

/**
 * hash(publicKey + entryId) — used for knowledge votedBy sets.
 */
export function hashVoteIdentity(publicKey: PublicKeyHex, entryId: string): string {
  const input = new TextEncoder().encode(`vote:${publicKey}:${entryId}`);
  return bytesToHex(sha256(input));
}

/**
 * hash(email) — used by relay for recovery lookup.
 * Email is never stored in plaintext.
 */
export function hashEmail(email: string): string {
  const input = new TextEncoder().encode(`email:${email.toLowerCase().trim()}`);
  return bytesToHex(sha256(input));
}
