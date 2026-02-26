// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Nuclear Data Wipe
//
// Wipes all local SQLite data and SecureStore secrets.
// Called only from MyRootScreen "Delete everything" — double-confirmed.
// After this runs, emit 'data-nuked' so App.tsx transitions back to Covenant.
// ═══════════════════════════════════════════════════════════════════════════

import * as SecureStore from 'expo-secure-store';
import { getDb } from './index';
import { getIdentity } from './identity';

const ALL_TABLES = [
  'sync_meta',
  'post_log',
  'blocked_handles',
  'vector_clocks',
  'appeals',
  'knowledge_entries',
  'coalitions',
  'trust_scores',
  'exchanges',
  'posts',
  'communities',
  'identity',
  'contact_info',
  'contact_reveals',
  'schema_version',
] as const;

/**
 * Permanently destroys all local data:
 *   - Empties every SQLite table (structure preserved for re-use)
 *   - Deletes the Ed25519 private key from SecureStore
 *   - Deletes all community keys from SecureStore
 *
 * After calling this, emit 'data-nuked' on the app event bus so App.tsx
 * resets to the Covenant onboarding flow.
 *
 * This function does NOT navigate — the caller must handle that.
 */
export async function nukeLocalData(): Promise<void> {
  // Capture community IDs before we wipe identity so we can clean their keys
  const identity = await getIdentity();
  const communityIds: string[] = identity?.communityIds ?? [];

  const db = await getDb();

  // Wipe every table. Order matters: FK-constrained tables cleared first
  // (SQLite enforces FK constraints only when pragma foreign_keys=ON, which
  // expo-sqlite does not enable by default, but we clear in dependency order
  // anyway for correctness if FK enforcement is ever added).
  for (const table of ALL_TABLES) {
    await db.runAsync(`DELETE FROM ${table}`);
  }

  // Remove private key from secure enclave
  await SecureStore.deleteItemAsync('rs_private_key').catch(() => {/* already gone */});

  // Remove community keys — one per community
  for (const cid of communityIds) {
    await SecureStore.deleteItemAsync(`rs_ck_${cid}`).catch(() => {/* already gone */});
  }
}
