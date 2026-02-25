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
import { sha512 } from '@noble/hashes/sha2.js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { PublicKeyHex, Signature } from '../models/types';

// @noble/ed25519 v3 requires sha512 to be injected for React Native
// (RN doesn't have the Web Crypto API noble uses by default).
// The etc object has these properties at runtime but not in its v3 TS types.
(ed.etc as Record<string, unknown>)['sha512Sync'] =
  (...msgs: Uint8Array[]) => sha512(ed.etc.concatBytes(...msgs));
(ed.etc as Record<string, unknown>)['sha512Async'] =
  (...msgs: Uint8Array[]) => Promise.resolve(sha512(ed.etc.concatBytes(...msgs)));

const SECURE_STORE_KEY = 'rs_private_key';

// ─── HELPERS ───────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
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
