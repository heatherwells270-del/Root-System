// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Database Initialization
//
// Opens the SQLite database, runs the schema on first launch,
// and handles version migrations. Everything else imports `getDb()`
// to get the shared connection.
// ═══════════════════════════════════════════════════════════════════════════

import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES, MIGRATIONS, SCHEMA_VERSION } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Open (or return) the shared database connection.
 * Safe to call multiple times — returns the same instance.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('rootsystem.db');
  await _db.execAsync('PRAGMA foreign_keys = ON');
  await initSchema(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  // Run all CREATE TABLE IF NOT EXISTS statements
  await db.execAsync(CREATE_TABLES);

  // Check current schema version
  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  );
  const currentVersion = row?.version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    // Run any pending migrations in order
    for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
      if (MIGRATIONS[v]) {
        await db.execAsync(MIGRATIONS[v]);
      }
    }
    await db.runAsync(
      'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)',
      [SCHEMA_VERSION, new Date().toISOString()]
    );
  }
}
