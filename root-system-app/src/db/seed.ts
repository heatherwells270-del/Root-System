// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Demo Seed Data
//
// Populates the DB with fictional community members and activity so the app
// looks lived-in during a demo. All seed records use upsert (INSERT OR IGNORE
// via the existing upsert functions) so calling seedDemoData() twice is safe.
//
// Seed records are NEVER pushed to the relay — they use '_sig: seed-data'
// which is not a valid Ed25519 signature and will be rejected if somehow sent.
// ═══════════════════════════════════════════════════════════════════════════

import { getDb } from './index';
import { getIdentity } from './identity';
import { upsertPost } from './posts';
import { upsertExchange } from './exchanges';
import { upsertKnowledgeEntry } from './knowledge';
import { upsertCoalition } from './coalitions';
import { upsertPublicTrustScore } from './trust';
import type { Post, Exchange, KnowledgeEntry, Coalition, PublicTrustScore } from '../models/types';

// Deterministic fake public keys — not real Ed25519 keypairs.
// These exist only for display. Never used to sign or verify anything.
export const SEED_KEY_IXIDOR = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff66660000777788889999';
export const SEED_KEY_MAREN  = 'bbbb2222cccc3333dddd4444eeee5555ffff66660000777788889999aaaa1111';

const SEED_HANDLE_IXIDOR = 'Ixidor';
const SEED_HANDLE_MAREN  = 'Maren';
const SEED_BIO_IXIDOR = 'Bikes, gardens, and the occasional home repair. Here to share.';
const SEED_BIO_MAREN  = 'Librarian by trade, baker by choice. Ask me about books.';

/** Returns true if seed data has already been loaded. */
export async function isSeeded(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM posts WHERE id = 'seed-post-ixidor-1' LIMIT 1`
  );
  return row !== null;
}

/**
 * Populates the DB with demo community data.
 * Idempotent — safe to call multiple times. Uses the current user's
 * community ID so demo content shows up alongside real data.
 */
export async function seedDemoData(): Promise<void> {
  const identity = await getIdentity();
  if (!identity) throw new Error('No identity found — set up your account first');

  const communityId = identity.communityIds[0];
  if (!communityId) throw new Error('No community found — join or create a community first');

  const userKey    = identity.publicKey;
  const userHandle = identity.handle ?? 'neighbor';

  const now = new Date();
  const ago  = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
  const ahead = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

  // ── POSTS ──────────────────────────────────────────────────────────────

  const posts: Post[] = [
    {
      id:              'seed-post-ixidor-1',
      communityId,
      type:            'offer',
      freeSubtype:     null,
      category:        'skills',
      zone:            'local',
      title:           'Free bike tune-up',
      body:            "I've been fixing bikes since I was a kid — gears, brakes, cables, derailleur adjustments, seat height. Bring your bike by and I'll get it rolling right. No charge. Just glad to help.",
      tags:            ['bikes', 'repair'],
      recurring:       true,
      authorPublicKey: SEED_KEY_IXIDOR,
      handle:          SEED_HANDLE_IXIDOR,
      bio:             SEED_BIO_IXIDOR,
      contactInfoEncrypted: null,
      timebankHours:   null,
      createdAt:       ago(5),
      expiresAt:       ahead(9),
      renewedAt:       null,
      status:          'active',
      flags:           0,
      flaggedBy:       [],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(5),
      _tombstone:      false,
    },
    {
      id:              'seed-post-ixidor-2',
      communityId,
      type:            'free',
      freeSubtype:     'items',
      category:        'food',
      zone:            'local',
      title:           'Seedlings — tomatoes & peppers',
      body:            "Started too many from seed this year. Have Cherokee Purple tomatoes and Anaheim peppers — about 20 plants total. First come, first served. Come by anytime before the weekend.",
      tags:            ['plants', 'garden', 'tomatoes', 'peppers'],
      recurring:       false,
      authorPublicKey: SEED_KEY_IXIDOR,
      handle:          SEED_HANDLE_IXIDOR,
      bio:             SEED_BIO_IXIDOR,
      contactInfoEncrypted: null,
      timebankHours:   null,
      createdAt:       ago(4),
      expiresAt:       ahead(3),
      renewedAt:       null,
      status:          'active',
      flags:           0,
      flaggedBy:       [],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(4),
      _tombstone:      false,
    },
    {
      id:              'seed-post-ixidor-3',
      communityId,
      type:            'offer',
      freeSubtype:     null,
      category:        'knowledge',
      zone:            'local',
      title:           'Spanish conversation practice',
      body:            "Native speaker, happy to meet for coffee and practice with anyone learning. All levels welcome — I remember what it's like to be a beginner. No pressure, just conversation.",
      tags:            ['spanish', 'language', 'learning'],
      recurring:       true,
      authorPublicKey: SEED_KEY_IXIDOR,
      handle:          SEED_HANDLE_IXIDOR,
      bio:             SEED_BIO_IXIDOR,
      contactInfoEncrypted: null,
      timebankHours:   1,
      createdAt:       ago(3),
      expiresAt:       ahead(11),
      renewedAt:       null,
      status:          'active',
      flags:           0,
      flaggedBy:       [],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(3),
      _tombstone:      false,
    },
    {
      id:              'seed-post-ixidor-4',
      communityId,
      type:            'need',
      freeSubtype:     null,
      category:        'goods',
      zone:            'local',
      title:           'Borrow: hand truck',
      body:            "Moving a couch to my sister's place this Saturday. Does anyone have a hand truck I could borrow for a few hours? I'll bring it back the same day.",
      tags:            ['hand truck', 'moving', 'borrow'],
      recurring:       false,
      authorPublicKey: SEED_KEY_IXIDOR,
      handle:          SEED_HANDLE_IXIDOR,
      bio:             SEED_BIO_IXIDOR,
      contactInfoEncrypted: null,
      timebankHours:   null,
      createdAt:       ago(2),
      expiresAt:       ahead(5),
      renewedAt:       null,
      status:          'active',
      flags:           0,
      flaggedBy:       [],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(2),
      _tombstone:      false,
    },
    {
      id:              'seed-post-maren-1',
      communityId,
      type:            'free',
      freeSubtype:     'items',
      category:        'goods',
      zone:            'local',
      title:           'Picture books — bag of 12',
      body:            "My kids outgrew them. Mix of classics and newer ones — good condition, no torn pages. Happy to leave them on the porch for pickup. Just message me and they're yours.",
      tags:            ['books', 'kids', 'free'],
      recurring:       false,
      authorPublicKey: SEED_KEY_MAREN,
      handle:          SEED_HANDLE_MAREN,
      bio:             SEED_BIO_MAREN,
      contactInfoEncrypted: null,
      timebankHours:   null,
      createdAt:       ago(6),
      expiresAt:       ahead(8),
      renewedAt:       null,
      status:          'active',
      flags:           0,
      flaggedBy:       [],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(6),
      _tombstone:      false,
    },
    {
      id:              'seed-post-maren-2',
      communityId,
      type:            'offer',
      freeSubtype:     null,
      category:        'skills',
      zone:            'local',
      title:           'Clothing repairs & alterations',
      body:            "I can hem pants, take in or let out seams, mend tears, replace zippers and buttons. Bring me something that's been sitting unworn because it doesn't quite fit — I'll make it wearable again.",
      tags:            ['sewing', 'alterations', 'mending', 'clothing'],
      recurring:       true,
      authorPublicKey: SEED_KEY_MAREN,
      handle:          SEED_HANDLE_MAREN,
      bio:             SEED_BIO_MAREN,
      contactInfoEncrypted: null,
      timebankHours:   1,
      createdAt:       ago(3),
      expiresAt:       ahead(11),
      renewedAt:       null,
      status:          'active',
      flags:           0,
      flaggedBy:       [],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(3),
      _tombstone:      false,
    },
    {
      id:              'seed-post-maren-3',
      communityId,
      type:            'need',
      freeSubtype:     null,
      category:        'food',
      zone:            'local',
      title:           'Sourdough starter wanted',
      body:            "I've been wanting to bake my first loaf for months. Does anyone have a sourdough starter they'd be willing to share? Even a small amount is enough to get going.",
      tags:            ['sourdough', 'baking', 'starter'],
      recurring:       false,
      authorPublicKey: SEED_KEY_MAREN,
      handle:          SEED_HANDLE_MAREN,
      bio:             SEED_BIO_MAREN,
      contactInfoEncrypted: null,
      timebankHours:   null,
      createdAt:       ago(1),
      expiresAt:       ahead(13),
      renewedAt:       null,
      status:          'active',
      flags:           0,
      flaggedBy:       [],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(1),
      _tombstone:      false,
    },
  ];

  for (const post of posts) {
    await upsertPost(post);
  }

  // ── EXCHANGES ────────────────────────────────────────────────────────────

  const exchanges: Exchange[] = [
    // Ixidor tuned up the user's bike — confirmed
    {
      id:              'seed-exch-1',
      communityId,
      fromPublicKey:   SEED_KEY_IXIDOR,
      toPublicKey:     userKey,
      fromHandle:      SEED_HANDLE_IXIDOR,
      toHandle:        userHandle,
      hours:           2,
      description:     'Full bike tune-up — adjusted gears and brakes, trued both wheels',
      emoji:           '🚲',
      confirmedByFrom: true,
      confirmedByTo:   true,
      status:          'confirmed',
      createdAt:       ago(14),
      expiresAt:       ago(12),
      confirmedAt:     ago(13),
      _sig:            'seed-data',
      _version:        2,
      _updatedAt:      ago(13),
    },
    // User helped Ixidor with tech — confirmed
    {
      id:              'seed-exch-2',
      communityId,
      fromPublicKey:   userKey,
      toPublicKey:     SEED_KEY_IXIDOR,
      fromHandle:      userHandle,
      toHandle:        SEED_HANDLE_IXIDOR,
      hours:           1.5,
      description:     'Set up a new laptop — migrated files and installed apps',
      emoji:           '💻',
      confirmedByFrom: true,
      confirmedByTo:   true,
      status:          'confirmed',
      createdAt:       ago(10),
      expiresAt:       ago(8),
      confirmedAt:     ago(9),
      _sig:            'seed-data',
      _version:        2,
      _updatedAt:      ago(9),
    },
    // Maren hemmed pants for the user — confirmed
    {
      id:              'seed-exch-3',
      communityId,
      fromPublicKey:   SEED_KEY_MAREN,
      toPublicKey:     userKey,
      fromHandle:      SEED_HANDLE_MAREN,
      toHandle:        userHandle,
      hours:           1,
      description:     'Hemmed two pairs of pants and replaced a zipper',
      emoji:           '🧵',
      confirmedByFrom: true,
      confirmedByTo:   true,
      status:          'confirmed',
      createdAt:       ago(7),
      expiresAt:       ago(5),
      confirmedAt:     ago(6),
      _sig:            'seed-data',
      _version:        2,
      _updatedAt:      ago(6),
    },
    // Ixidor fixed Maren's flat tire — confirmed
    {
      id:              'seed-exch-4',
      communityId,
      fromPublicKey:   SEED_KEY_IXIDOR,
      toPublicKey:     SEED_KEY_MAREN,
      fromHandle:      SEED_HANDLE_IXIDOR,
      toHandle:        SEED_HANDLE_MAREN,
      hours:           1,
      description:     'Fixed a flat tire and adjusted the rear brake',
      emoji:           '🚲',
      confirmedByFrom: true,
      confirmedByTo:   true,
      status:          'confirmed',
      createdAt:       ago(20),
      expiresAt:       ago(18),
      confirmedAt:     ago(19),
      _sig:            'seed-data',
      _version:        2,
      _updatedAt:      ago(19),
    },
    // Ixidor → user, Spanish lesson — pending, user hasn't confirmed yet
    {
      id:              'seed-exch-5',
      communityId,
      fromPublicKey:   SEED_KEY_IXIDOR,
      toPublicKey:     userKey,
      fromHandle:      SEED_HANDLE_IXIDOR,
      toHandle:        userHandle,
      hours:           1,
      description:     'Spanish conversation practice — 1 hour over coffee',
      emoji:           '☕',
      confirmedByFrom: true,
      confirmedByTo:   false,
      status:          'pending',
      createdAt:       ago(1),
      expiresAt:       ahead(1),
      confirmedAt:     null,
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(1),
    },
  ];

  for (const exchange of exchanges) {
    await upsertExchange(exchange);
  }

  // ── KNOWLEDGE ENTRIES ───────────────────────────────────────────────────

  const knowledge: KnowledgeEntry[] = [
    {
      id:              'seed-know-1',
      communityId,
      title:           'Where to find free food in your neighborhood',
      summary:         "A guide to food pantries, free fridges, community gardens, and surplus produce networks that don't require proof of income.",
      body:            "You don't need to prove you're struggling to use these resources — they're for everyone.\n\n**Food pantries** — Most food pantries are open to anyone. Many don't ask for ID or income verification. Search \"food pantry\" + your zip code, or call 211 for a local referral.\n\n**Little Free Pantries** — Like Little Free Libraries but for food. Check littlefreepantry.org for a map near you.\n\n**Community fridges** — Open 24/7, stocked by neighbors. Search \"community fridge\" + your city.\n\n**SNAP/EBT** — If you're unsure whether you qualify, you probably do. Apply at your state's benefits portal or through benefits.gov. Many states have same-day enrollment for families with children.",
      category:        'food',
      tags:            ['food', 'pantry', 'free', 'mutual aid', 'SNAP'],
      handle:          SEED_HANDLE_IXIDOR,
      authorPublicKey: SEED_KEY_IXIDOR,
      createdAt:       ago(10),
      updatedAt:       ago(10),
      flags:           0,
      flaggedBy:       [],
      status:          'active',
      helpful:         4,
      votedBy:         ['vote-h1', 'vote-h2', 'vote-h3', 'vote-h4'],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(10),
      _tombstone:      false,
    },
    {
      id:              'seed-know-2',
      communityId,
      title:           'How to fix a flat tire — no bike shop required',
      summary:         'Step-by-step: remove the wheel, patch or replace the tube, get back on the road in under 20 minutes.',
      body:            "What you need: a patch kit or spare inner tube, two tire levers (or a spoon), a pump.\n\n**1. Remove the wheel** — If it's the rear, shift to the smallest gear first. Open the brake quick-release, then the axle quick-release.\n\n**2. Pull the tire off** — Deflate completely. Use tire levers to pry one side of the tire bead off the rim. Work your way around. Pull out the tube.\n\n**3. Find the puncture** — Inflate the tube slightly. Feel for air escaping. Check the inside of the tire for whatever caused the flat — glass, thorn, staple — and remove it.\n\n**4. Patch or replace** — For a patch: rough up the area, apply glue, wait until tacky, press on patch firmly. For a new tube: just swap it in.\n\n**5. Reassemble** — Tuck the tube in, reseat the tire (check no tube is pinched), inflate to the PSI printed on the sidewall.\n\nBring your bike by if you get stuck — happy to walk you through it in person.",
      category:        'skills',
      tags:            ['bike', 'repair', 'flat tire', 'DIY'],
      handle:          SEED_HANDLE_IXIDOR,
      authorPublicKey: SEED_KEY_IXIDOR,
      createdAt:       ago(8),
      updatedAt:       ago(8),
      flags:           0,
      flaggedBy:       [],
      status:          'active',
      helpful:         7,
      votedBy:         ['vote-h5', 'vote-h6', 'vote-h7', 'vote-h8', 'vote-h9', 'vote-h10', 'vote-h11'],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(8),
      _tombstone:      false,
    },
    {
      id:              'seed-know-3',
      communityId,
      title:           'Basic clothes mending — no sewing machine needed',
      summary:         'How to sew on a button, close a seam, and repair a small tear by hand in under 10 minutes.',
      body:            "**What you need:** A needle (a pack is $1 at any drugstore), thread in a matching color, scissors.\n\n**Sewing on a button:**\nThread your needle — cut about 18 inches, fold in half, knot the end. Push through the fabric from the back, up through a buttonhole, down through the opposite hole, through the fabric again. Repeat 6–8 times. Finish by wrapping the thread around the stitches under the button to form a shank. Knot and cut.\n\n**Closing a seam:**\nMatch the seam edges. A running stitch (in and out, evenly spaced) holds them together for light use. For something structural, backstitch is stronger — push in, come back, push forward.\n\n**Mending a tear:**\nFor a small clean tear, a few running stitches to close it will do. For a worn area, a darning stitch — weaving back and forth to fill the hole — adds strength.\n\nIf you have something bigger that needs work, bring it by — happy to help.",
      category:        'skills',
      tags:            ['sewing', 'mending', 'clothing', 'repair', 'DIY'],
      handle:          SEED_HANDLE_MAREN,
      authorPublicKey: SEED_KEY_MAREN,
      createdAt:       ago(5),
      updatedAt:       ago(5),
      flags:           0,
      flaggedBy:       [],
      status:          'active',
      helpful:         5,
      votedBy:         ['vote-h12', 'vote-h13', 'vote-h14', 'vote-h15', 'vote-h16'],
      _sig:            'seed-data',
      _version:        1,
      _updatedAt:      ago(5),
      _tombstone:      false,
    },
  ];

  for (const entry of knowledge) {
    await upsertKnowledgeEntry(entry);
  }

  // ── COALITION ────────────────────────────────────────────────────────────

  const toolLibrary: Coalition = {
    id:            'seed-coalition-1',
    communityId,
    title:         'Tool Library Collective',
    purpose:       'Sharing tools so we buy less and neighbors borrow more. Drills, ladders, hand trucks, clamps, garden tools — if you have it and rarely use it, list it here. If you need it, ask.',
    contact:       'Find us in the community app or message any member.',
    zone:          'local',
    memberKeys:    [SEED_KEY_IXIDOR, SEED_KEY_MAREN, userKey],
    memberHandles: {
      [SEED_KEY_IXIDOR]: SEED_HANDLE_IXIDOR,
      [SEED_KEY_MAREN]:  SEED_HANDLE_MAREN,
      [userKey]:         userHandle,
    },
    createdAt:  ago(21),
    createdBy:  SEED_KEY_IXIDOR,
    _sig:       'seed-data',
    _version:   3,
    _updatedAt: ago(1),
    _tombstone: false,
  };

  await upsertCoalition(toolLibrary);

  // ── TRUST SCORES ─────────────────────────────────────────────────────────

  const ixidorTrust: PublicTrustScore = {
    publicKey:     SEED_KEY_IXIDOR,
    publicScore:   7.1,
    exchangeCount: 8,
    postsSurvived: 12,
    _version:      8,
    _updatedAt:    ago(1),
  };

  const marenTrust: PublicTrustScore = {
    publicKey:     SEED_KEY_MAREN,
    publicScore:   6.6,
    exchangeCount: 5,
    postsSurvived: 9,
    _version:      5,
    _updatedAt:    ago(2),
  };

  await upsertPublicTrustScore(ixidorTrust);
  await upsertPublicTrustScore(marenTrust);
}
