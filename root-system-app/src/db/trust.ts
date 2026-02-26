// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Trust Score Queries
//
// Private score (2.0–10.0): local only, full event history, used for UI.
// Public score: rounded to 1dp, transmitted to peers as PublicTrustScore.
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import type { TrustScore, PublicTrustScore, TrustEvent, TrustReason } from '../models/types';

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

export const TRUST_DELTAS: Record<TrustReason, number> = {
  exchange_confirmed: +0.5,
  post_survived:      +0.1,
  flag_received:      -0.5,
  post_removed:       -1.0,
  appeal_restored:    +0.5,
  appeal_upheld:      -0.3,
};

const MIN_SCORE = 2.0;
const MAX_SCORE = 10.0;

/**
 * Recomputes a trust score from full event history using recency weighting.
 * Starting baseline: 5.0. Events decay as they age:
 *   < 30 days  → 100% weight
 *   30–90 days → 75% weight
 *   90–365 days → 50% weight
 *   > 1 year   → 25% weight
 *
 * This means a flag from 3 years ago doesn't permanently define someone,
 * and a recent run of good exchanges can rehabilitate a score.
 */
function computeScoreFromHistory(history: TrustEvent[]): number {
  const now = Date.now();
  let score = 5.0;
  for (const event of history) {
    const ageDays = (now - new Date(event.timestamp).getTime()) / 86_400_000;
    const weight =
      ageDays < 30  ? 1.0 :
      ageDays < 90  ? 0.75 :
      ageDays < 365 ? 0.5 : 0.25;
    score += event.delta * weight;
  }
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
}

interface TrustRow {
  public_key:     string;
  score:          number;
  public_score:   number;
  exchange_count: number;
  posts_survived: number;
  history:        string;
  version:        number;
  updated_at:     string;
}

function rowToTrustScore(r: TrustRow): TrustScore {
  return {
    publicKey:     r.public_key,
    score:         r.score,
    publicScore:   r.public_score,
    exchangeCount: r.exchange_count,
    postsSurvived: r.posts_survived,
    history:       safeParse<TrustEvent[]>(r.history, []),
    _version:      r.version,
    _updatedAt:    r.updated_at,
  };
}

function rowToPublicTrustScore(r: TrustRow): PublicTrustScore {
  return {
    publicKey:     r.public_key,
    publicScore:   r.public_score,
    exchangeCount: r.exchange_count,
    postsSurvived: r.posts_survived,
    _version:      r.version,
    _updatedAt:    r.updated_at,
  };
}

// ─── READS ──────────────────────────────────────────────────────────────────

export async function getTrustScore(publicKey: string): Promise<TrustScore | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TrustRow>(
    'SELECT * FROM trust_scores WHERE public_key = ?', [publicKey]
  );
  return row ? rowToTrustScore(row) : null;
}

export async function getPublicTrustScore(publicKey: string): Promise<PublicTrustScore | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TrustRow>(
    'SELECT * FROM trust_scores WHERE public_key = ?', [publicKey]
  );
  return row ? rowToPublicTrustScore(row) : null;
}

// ─── WRITES ─────────────────────────────────────────────────────────────────

/**
 * Upsert a public trust score received from a peer during sync.
 * Never overwrites local private score or history.
 */
export async function upsertPublicTrustScore(score: PublicTrustScore): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO trust_scores (
       public_key, score, public_score, exchange_count, posts_survived,
       history, version, updated_at
     ) VALUES (?, ?, ?, ?, ?, '[]', ?, ?)
     ON CONFLICT(public_key) DO UPDATE SET
       public_score   = CASE WHEN excluded.version > trust_scores.version THEN excluded.public_score   ELSE trust_scores.public_score   END,
       exchange_count = CASE WHEN excluded.version > trust_scores.version THEN excluded.exchange_count ELSE trust_scores.exchange_count END,
       posts_survived = CASE WHEN excluded.version > trust_scores.version THEN excluded.posts_survived ELSE trust_scores.posts_survived END,
       version        = MAX(trust_scores.version, excluded.version),
       updated_at     = CASE WHEN excluded.version > trust_scores.version THEN excluded.updated_at     ELSE trust_scores.updated_at     END`,
    [
      score.publicKey, score.publicScore, score.publicScore,
      score.exchangeCount, score.postsSurvived,
      score._version, now,
    ]
  );
}

/**
 * Apply a trust event to this device's own trust score.
 * Clamps to 2.0–10.0, derives publicScore (1dp), appends to history.
 */
export async function applyTrustEvent(publicKey: string, event: TrustEvent): Promise<void> {
  const db  = await getDb();
  const now = new Date().toISOString();

  const current  = await getTrustScore(publicKey);
  const exchCt   = current?.exchangeCount ?? 0;
  const survived = current?.postsSurvived ?? 0;
  const history  = current?.history       ?? [];

  const full            = [...history, event];
  const newHistory      = full.length > 100 ? full.slice(-100) : full;
  const newScore        = computeScoreFromHistory(newHistory);
  const newPublicScore  = Math.round(newScore * 10) / 10;
  const newExchangeCount = event.reason === 'exchange_confirmed' ? exchCt + 1 : exchCt;
  const newPostsSurvived = event.reason === 'post_survived'      ? survived + 1 : survived;

  await db.runAsync(
    `INSERT INTO trust_scores (
       public_key, score, public_score, exchange_count, posts_survived,
       history, version, updated_at
     ) VALUES (?,?,?,?,?,?,1,?)
     ON CONFLICT(public_key) DO UPDATE SET
       score          = ?,
       public_score   = ?,
       exchange_count = ?,
       posts_survived = ?,
       history        = ?,
       version        = trust_scores.version + 1,
       updated_at     = ?`,
    [
      publicKey, newScore, newPublicScore, newExchangeCount, newPostsSurvived,
      JSON.stringify(newHistory), now,
      // UPDATE SET values:
      newScore, newPublicScore, newExchangeCount, newPostsSurvived,
      JSON.stringify(newHistory), now,
    ]
  );
}
