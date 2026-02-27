import {
  generateKeypair,
  sign,
  verify,
  exportRecoveryKey,
  restoreFromRecoveryKey,
  canonicalPost,
  canonicalExchange,
  canonicalAuth,
  canonicalNonce,
  canonicalCommunity,
  canonicalTombstone,
} from '../keypair';

// ─── Canonical message formats ───────────────────────────────────────────────
// Pure functions — no mocks needed. Same input must always produce same output.

describe('canonical message formats', () => {
  const post = {
    id: 'post-1',
    communityId: 'comm-1',
    type: 'offer',
    title: 'Free tomatoes',
    body: 'Lots of them',
    authorPublicKey: 'abcd1234',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('canonicalPost produces deterministic colon-separated string', () => {
    const result = canonicalPost(post);
    expect(result).toBe('post:post-1:comm-1:offer:Free tomatoes:Lots of them:abcd1234:2026-01-01T00:00:00.000Z');
  });

  it('canonicalPost is deterministic (same output on repeat calls)', () => {
    expect(canonicalPost(post)).toBe(canonicalPost(post));
  });

  it('canonicalExchange produces deterministic string', () => {
    const exchange = {
      id: 'ex-1', communityId: 'comm-1',
      fromPublicKey: 'aaaa', toPublicKey: 'bbbb',
      hours: 2, createdAt: '2026-01-01T00:00:00.000Z',
    };
    const result = canonicalExchange(exchange);
    expect(result).toBe('exchange:ex-1:comm-1:aaaa:bbbb:2:2026-01-01T00:00:00.000Z');
    expect(canonicalExchange(exchange)).toBe(result);
  });

  it('canonicalAuth starts with auth: prefix', () => {
    const result = canonicalAuth('pubkey', 'deviceid', 'timestamp');
    expect(result).toBe('auth:pubkey:deviceid:timestamp');
  });

  it('canonicalNonce starts with nonce: prefix', () => {
    expect(canonicalNonce('abc123')).toBe('nonce:abc123');
  });

  it('canonicalCommunity starts with community: prefix', () => {
    const community = {
      id: 'c1', name: 'Eastside', planterPublicKey: 'pk', createdAt: '2026-01-01T00:00:00.000Z',
    };
    const result = canonicalCommunity(community);
    expect(result).toBe('community:c1:Eastside:pk:2026-01-01T00:00:00.000Z');
  });

  it('canonicalTombstone starts with tombstone: prefix', () => {
    expect(canonicalTombstone('post-1', 'author-pk')).toBe('tombstone:post-1:author-pk');
  });
});

// ─── Sign / verify round-trip ────────────────────────────────────────────────
// Uses SecureStore + expo-crypto mocks from setup.ts

describe('sign and verify', () => {
  let publicKey: string;

  beforeAll(async () => {
    publicKey = await generateKeypair();
  });

  it('generateKeypair returns a 64-char lowercase hex string', () => {
    expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sign + verify round-trip returns true', async () => {
    const message = 'hello root system';
    const sig = await sign(message);
    const valid = await verify(message, sig, publicKey);
    expect(valid).toBe(true);
  });

  it('verify returns false when message is different', async () => {
    const sig = await sign('original message');
    const valid = await verify('tampered message', sig, publicKey);
    expect(valid).toBe(false);
  });

  it('verify returns false with a wrong public key', async () => {
    const message = 'test';
    const sig = await sign(message);
    const wrongKey = 'a'.repeat(64); // not a valid keypair for this sig
    const valid = await verify(message, sig, wrongKey);
    expect(valid).toBe(false);
  });
});

// ─── Recovery key round-trip ─────────────────────────────────────────────────
// Most critical test: user's identity backup/restore path.

describe('exportRecoveryKey and restoreFromRecoveryKey', () => {
  let originalPublicKey: string;
  let backupString: string;

  beforeAll(async () => {
    originalPublicKey = await generateKeypair();
    backupString = await exportRecoveryKey('correct-passphrase-123');
  });

  it('exportRecoveryKey returns a string starting with rsrc_v1:', () => {
    expect(backupString.startsWith('rsrc_v1:')).toBe(true);
  });

  it('backup string has three colon-separated parts', () => {
    const parts = backupString.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('rsrc_v1');
  });

  it('restoreFromRecoveryKey with correct passphrase returns the same public key', async () => {
    const restored = await restoreFromRecoveryKey(backupString, 'correct-passphrase-123');
    expect(restored).toBe(originalPublicKey);
  });

  it('restoreFromRecoveryKey with wrong passphrase throws', async () => {
    await expect(
      restoreFromRecoveryKey(backupString, 'wrong-passphrase')
    ).rejects.toThrow();
  });

  it('restoreFromRecoveryKey with garbage input throws', async () => {
    await expect(
      restoreFromRecoveryKey('this is not a valid backup string', 'passphrase')
    ).rejects.toThrow();
  });

  it('restoreFromRecoveryKey with wrong prefix throws', async () => {
    const tampered = backupString.replace('rsrc_v1', 'rsrc_v2');
    await expect(
      restoreFromRecoveryKey(tampered, 'correct-passphrase-123')
    ).rejects.toThrow();
  });
});
