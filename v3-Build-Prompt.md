# Root System v3 — Final Build Prompt
### Complete Specification. All decisions locked. All safety gaps addressed.
*February 24, 2026 — Revision: FINAL*

---

## Instructions

You are building v3 of Root System — a free, open-source mutual aid network, time bank, and knowledge commons. The attached `mutual-aid-v2.jsx` is the working v2 codebase (1,248 lines, single-file React component). Build v3 as a single `.jsx` file that carries forward all v2 functionality and adds everything specified below.

**Output:** One complete `mutual-aid-v3.jsx` file. Single-file React component with all CSS inlined. Default export. No required props.

**Build in layers** (this is too large for one pass):
- Layer 1: Foundation (device ID, Covenant wall + comprehension gate, rate limiting, contact protection, block/mute)
- Layer 2: Geography (zip codes, distance sorting, post expiration)
- Layer 3: Categories + Governance (Free Items, trust scores, appeals, Community Review)
- Layer 4: Content (Tool Directory, Secure Channel, Safety section expansion)
- Layer 5: Polish (About rewrite, footer, language cleanup, accessibility pass, warnings)

---

## Design System (Carry Forward Exactly)

**Aesthetic:** Dark Art Nouveau botanical. Handprinted broadsheet from a woodland collective.

**Fonts (Google Fonts, already loaded in v2):**
- Display/Headers: Cormorant Garamond (300, 400, 600, 700 + italics)
- Body: Crimson Text (400, 600 + italics)
- Accent/Quotes: IM Fell DW Pica (400 + italic)

**Color Palette (CSS variables, already in v2):**
```
--deep: #0b1209        --forest: #141e12      --canopy: #1c2a1a
--bark: #2a1c0e        --parchment: #ede0ba   --aged: #c9b47a
--gold: #c4982e        --gold-light: #e0bb60  --botanical: #3d6b2e
--sage: #5e8a4a        --moss: #2e4a22        --mauve: #7a4a8a
--cosmos: #4a3a72      --lavender: #b09acc    --burgundy: #5e1520
--wine: #8a2535        --moonsilver: #c8d0c0  --ink: #0a0f09
```

**Animations:** shimmer, unfurl, fadeIn, petal (from v2). Add new as needed — organic/botanical only. Nothing mechanical or bouncy.

**Accessibility (non-negotiable):**
- All interactive elements keyboard-navigable (tab order, enter to activate)
- All icons/images have alt text or aria-labels
- Color contrast meets WCAG AA minimum (4.5:1 text, 3:1 large text)
- Screen reader compatibility: proper semantic HTML, heading hierarchy, form labels, button text
- Visible focus indicators on all interactive elements
- Skip-to-content link at top of page
- No emoji as sole indicator — always paired with text
- Touch targets minimum 44x44px

**i18n preparation:** All UI strings in a centralized constants object at top of file.

**Print-friendly:** Bulletin mode from v2 extends to all new sections.

---

## v2 Features to Carry Forward

All existing views and functionality preserved:

1. **Browse** — filterable posts by type (offer/need), category, zone, keyword search, skill matching
2. **Post** — create need or offer with Community Compact shown before form
3. **Time Bank** — exchange log with running totals, one hour = one hour
4. **Coalitions** — collective projects with member lists
5. **Safety** — Safe Exchange Protocol, red flags checklist, resource directory, crisis numbers
6. **About** — app description (will be rewritten, see Section 19)

**Existing infrastructure to preserve:**
- Persistent shared storage via `window.storage` API
- Auto-removal at 3 flags
- Trust scores on every post handle
- Skill matching (needs surface matching offers)
- Print bulletin mode
- Crisis numbers in footer on every page
- No accounts, no backend

---

## v3 NEW FEATURES

---

### 1. DEVICE IDENTITY

On first visit, generate UUID v4: `window.storage.set('device-id', { id: crypto.randomUUID(), created: Date.now() })`

This is the identity anchor. Trust scores, rate limits, and vote tracking keyed to it. Handle changes are cosmetic — trust follows device. Device-id in personal storage only. Never shared. Never displayed. If storage cleared, fresh start — known accepted limitation.

---

### 2. TOS COVENANT WALL

**Behavior:**
- On load, check `window.storage.get('covenant-accepted')`
- If not accepted: posting, offering, time bank, coalitions, flagging, voting all gated
- **Never gated:** Browse (read-only), Free Resources, Knowledge Archive, Safety section, crisis numbers, Secure Channel, Tool Directory
- Version field in stored acceptance enables re-prompting on Covenant updates

**Visible statement before affirmation checkboxes:**

> "Root System is for adults. If you are under 18 and need help, please reach out to a trusted adult, call 211 for local services, or text HOME to 741741 for crisis support. You deserve help from people who are responsible for you — not from strangers on the internet."

**Affirmation checkboxes (both required):**
1. "I have read this Covenant and I enter this space in good faith"
2. "I confirm I am 18 years of age or older"

**Comprehension Gate (all 5 must be correct before "Enter the Commons" activates):**

Questions appear one at a time after checkboxes are checked.

Q1 — Safety responsibility:
"If you witness exploitation or abuse through this network, what should you do?"
- (a) Flag the post and move on
- (b) Report it to law enforcement or a community safety organization ✅
- (c) Post about it publicly to warn others

Q2 — Hate speech:
"Which of the following is considered hate speech under this Covenant?"
- (a) Disagreeing with someone's opinion in a heated argument
- (b) Language that dehumanizes or threatens people based on race, religion, gender identity, disability, or immigration status ✅
- (c) Criticizing a political policy you disagree with

Q3 — Bad faith actors:
"Which of these behaviors violates this Covenant?"
- (a) Posting that you need help with groceries
- (b) Offering free tutoring in your neighborhood
- (c) Offering excessive help to a stranger in order to build dependency or collect personal information ✅

Q4 — Platform purpose:
"This platform is for:"
- (a) Buying and selling goods and services
- (b) Neighbors exchanging skills, goods, time, and support directly ✅
- (c) Fundraising and collecting donations

Q5 — Privacy:
"Posts on this platform are:"
- (a) Private and visible only to logged-in community members
- (b) Public — anyone with the link can read them ✅
- (c) Encrypted and protected from outside access

**On wrong answer:** Highlight in soft red, show relevant Covenant section text below with "Re-read this section and try again." No lockout, no penalty, no limit on attempts. Point is education.

**On all correct:** "Enter the Commons" button unfurls with seal animation. Store `{ accepted: true, timestamp: Date.now(), version: '2026-02' }`.

**Design:** Full-screen overlay, parchment card, botanical vine border, Cormorant headings, Crimson body. Questions in clean card layout. Correct answers get subtle gold checkmark. 30-60 seconds for someone who read it.

**Covenant text to display (use exactly):**

> **The Root System Covenant**
>
> Before you use this space, read this. It is short because it means what it says.
>
> Root System is a community commons — a shared space that belongs to everyone who uses it in good faith, and to no one who doesn't.
>
> There is a human being on the other end of every post, every exchange, every message. Remember that always. Not a user. Not a handle. A person.
>
> **By entering and posting, you agree:**
>
> You are here to help neighbors, share what you have, ask for what you need, and protect everyone in this space. Not to profit from them. Not to exploit them. Not to collect their information for any purpose other than the exchange you are making.
>
> You will meet people in public first. You will share only what you are genuinely comfortable sharing. You will not pressure anyone, create false urgency, or ask for upfront payment before any exchange occurs.
>
> This space is not a marketplace, a dating platform, a solicitation board, or a dark corner of anything. If you are here for those purposes, leave now.
>
> This space is not for recruitment, sales pitches, or business promotion, including multilevel marketing. Offers must be genuine exchanges of skills, goods, or time — not funnels to paid products or services.
>
> **On hate speech:**
>
> This platform prohibits speech that targets people based on race, color, ethnicity, national origin, religion, sex, gender identity, sexual orientation, disability, or immigration status — including language that dehumanizes, threatens, or incites violence or discrimination against individuals or groups on these bases.
>
> This definition is grounded in protections established under federal civil rights law and the Matthew Shepard and James Byrd Jr. Hate Crimes Prevention Act (18 U.S.C. § 249), and draws on the legal doctrines of fighting words (*Chaplinsky v. New Hampshire*, 315 U.S. 568) and true threats. Posts meeting this standard will be removed immediately. Repeat violations result in permanent removal from the network.
>
> Disagreement, debate, and even heated argument are part of human community. Dehumanization is not.
>
> **On free expression:**
>
> This platform will not be used to silence, suppress, dox, or retaliate against legitimate voices — especially those whose voices have been historically suppressed. Black, Indigenous, and People of Color; LGBTQIA+ community members; people with disabilities; immigrants; and anyone whose voice has been systematically marginalized take space here as a matter of policy and values, not tolerance.
>
> Using this platform to coordinate the silencing, targeting, or harassment of any community member for speaking their truth is a violation of these terms and will result in permanent removal.
>
> **On safety warnings:** Sharing your own direct personal experience with a bad actor — including naming them by handle — is protected speech, not harassment. Warning the community about someone who harmed you is not a violation of this Covenant. Fabricating accusations is.
>
> **On prohibited content:** This platform may not be used to buy, sell, or trade illegal goods or services, including but not limited to controlled substances, stolen property, weapons, or unlicensed professional services (medical, electrical, plumbing, legal) that require licensure in your jurisdiction. Posts soliciting or offering sexual services are prohibited.
>
> **On integrity:**
>
> We hold ourselves to high integrity in every interaction. We say what we mean. We do what we say. We correct ourselves when we're wrong.
>
> **On safety:**
>
> If you witness or experience a safety incident through this network — exploitation, predatory behavior, trafficking, abuse — report it immediately to law enforcement or an appropriate community safety organization: a domestic violence hotline, legal aid organization, or community advocate. This commons belongs to all of us. Its safety is our collective responsibility.
>
> **On privacy:**
>
> Posts on this platform are public. Anyone with the link can read them. Consider what you share and whether it could affect your employment, housing, or relationships if seen by someone you did not intend.
>
> If you recognize someone from this platform in another context — at work, at church, in your neighborhood — do not reference their posts or presence here without their explicit permission. This is a community norm, not a suggestion.
>
> **On who this is for:**
>
> Everyone. Any background. Any faith tradition. Any community. Helping your neighbor is not an ideology. It is older than any movement that has tried to claim it.
>
> Specifically and explicitly: this platform centers and protects the voices of those who have been most excluded by systems of extraction and suppression. That centering is not partisan. It is just.
>
> This platform was created in good faith, given away freely, and governed by the communities that use it. The original creator is the architect, not the operator. The community is the steward.
>
> **Keep the good faith of it intact.**

---

### 3. RATE LIMITING

**Post limits:**
- Max 5 posts per 24-hour rolling window
- Max 2 posts within any 10-minute window
- When hit: "You've shared generously today. Come back tomorrow."
- Show remaining in post form footer: "3 of 5 posts remaining today"

**Flag limits:**
- Max 20 flags per 24-hour window
- Same device cannot flag same handle more than once
- When hit: "Thank you for helping keep this space safe."

**Vote limits:** Max 3 votes per 24-hour window

**Flag weighting:**
- Flags from devices created in last 24 hours carry half weight (need 6 to auto-remove)
- If all 3 flags from devices created in same hour, auto-escalate to appeal instead of removing

---

### 4. TAP-TO-REVEAL CONTACT INFO

- Separate "Contact Info" field in post form (optional)
- Placeholder: "Signal number, ProtonMail, or however you'd like to be reached"
- Not rendered in post card by default
- Button: "📬 Tap to see contact info" (with text label)
- On tap: 1.5s botanical animation, then modal
- Requires Covenant acceptance
- Modal text: "Meet in public first. Trust your instincts. Prefer Signal for private communication. Be cautious about platforms you're unfamiliar with. If someone asks you to move to Telegram, WhatsApp, or Instagram DMs, consider why they prefer a less secure channel."

---

### 5. BLOCK / MUTE

- Every post card: "Block this handle" in overflow menu
- Hides ALL posts from that handle in Browse, Time Bank, Coalitions
- Stored locally: `window.storage.set('blocked-handles', { handles: [...] })`
- Blocked handles can't see your contact info
- Block is private — blocked person doesn't know
- Unblock in Settings/Privacy area

---

### 6. POST EXPIRATION

- All posts auto-expire after **7 days**
- At day 5: "This post expires in 2 days — renew?"
- Renew resets 7-day clock
- Expired posts leave Browse but aren't deleted — can repost
- Coalition posts do NOT expire
- Time bank records permanent
- Expiration badge: "5d left" / "2d left" / "expires today"

---

### 7. ZIP CODE + DISTANCE SORTING

**Entry:** "Where are you rooted?" — 5 digit US zip. Store locally.

**Hybrid lookup:** Try `api.zippopotam.us/us/{zip}` first (3s timeout), fall back to bundled centroid dataset (~33,000 entries).

**Display:** Distance badge on posts — "~3 mi" / "~12 mi" / "~50+ mi". Haversine formula.

**Filter:** Radius in Browse — "Within 5 mi / 10 mi / 25 mi / 50 mi / Any distance" (default: Any)

**Privacy:** Zip centroid only. Local storage only. Posts show computed distance, not raw zip.

---

### 8. FREE ITEMS / FREE SERVICES

New post type "Free" with sub-categories: Free Items, Free Services, Free Knowledge. Badge: "🌿 Freely Given" (with text). No time bank credit. Same 7-day expiration. Distinct botanical border — soft gold vine motif.

---

### 9. TRUST SCORE TRANSPARENCY

- "What is this?" link → explainer modal
- Math: Start 5.0 / +0.5 completed exchange / +0.2 post stays 7d / -1.0 per flag / -2.0 community removal / +1.0 successful appeal
- **Floor: 2.0** (caution, not exile) / Ceiling: 10.0
- Tied to device-id, not handle
- History visible: events with deltas and timestamps

---

### 10. APPEAL MECHANISM + COMMUNITY REVIEW

**At 3 flags (or 6 half-weight):** Post hidden. Creator sees banner + appeal button (500 char). One appeal per post.

**Community Review tab:** Shows appeals. Vote "Restore" / "Uphold." 5 restore → reinstated (+1.0 trust). 10 uphold → permanent removal (-2.0). Expires 7 days.

**Graceful decay:** After 3 days, any restore votes + zero uphold votes → auto-restore.

Nav indicator: dot/number showing pending appeals. Voting requires Covenant acceptance.

---

### 11. SCAM PATTERN SOFT WARNINGS

Non-intrusive amber info bar below posts matching:
- **Payment platforms** (Venmo, CashApp, etc.): "Root System is for direct exchanges, not financial transactions."
- **Urgency language** (must respond today, act now, ALL CAPS): "This post uses urgency language. Take your time."
- **Off-platform redirect** (Telegram, Instagram DMs — NOT Signal/ProtonMail): "Consider using Signal or ProtonMail instead."
- **Personal documents** (send ID, SSN, license): "Never share personal documents through this platform."
- **Unrealistic offers** ($500+ with "free"): "High-value free offers from strangers deserve extra scrutiny."

Dismissible. Crimson Text italic.

---

### 12. CRISIS POST DETECTION

If post body matches crisis language ("can't do this anymore", "want to die", "suicide", "self-harm", "no way out", etc.) — display card directly below post:

> "If you or someone you know is in crisis:
> **988 Suicide & Crisis Lifeline** — call or text 988
> **Crisis Text Line** — text HOME to 741741
> **National DV Hotline** — 1-800-799-7233
> You are not alone. Help is available right now."

Soft botanical border, --lavender background. Not dismissible.

---

### 13. FAIR HOUSING WARNING

If category = Housing or body contains housing keywords: "Fair housing laws prohibit discrimination based on race, color, religion, sex, national origin, disability, or family status in housing-related posts."

---

### 14. UNSAFE ITEMS WARNING

If post involves physical goods with keywords (crib, car seat, space heater, baby, canned food, medication): "If giving or receiving baby equipment, check recall status at cpsc.gov. If receiving food, use your judgment about safety and storage."

---

### 15. PRIVACY REALITY WARNING

Visible near post form (not buried in TOS): "Posts on this platform are public. Anyone with the link can read them. Consider what you share and whether it could be seen by your employer, landlord, or family."

Subtle, always visible. --moonsilver color.

---

### 16. TOOL DIRECTORY

New nav tab "Tools." Collapsible accordion categories:

**Crisis & Mental Health:** 988, Crisis Text Line (741741), Open Path Collective, SAMHSA (1-800-662-4357)

**Basic Needs:** 211, findhelp.org, benefitscheckup.org, findahealthcenter.hrsa.gov

**Legal Aid:** lawhelp.org, RAINN (1-800-656-4673), National DV Hotline (1-800-799-7233), ACLU Know Your Rights

**Food Systems:** Seed Savers Exchange, Open Food Network, Repair Café, USDA Co-op Resources

**Privacy & Security:** Signal, ProtonMail, Tor Browser, EFF Surveillance Self-Defense

**Community Organizing:** timebanks.org, mutualaidhub.org, Loomio, Open Collective

**Communication:** Signal, Element/Matrix, Briar, Jitsi

Searchable. Print-friendly. Community suggestions layer with upvoting.

---

### 17. SECURE CHANNEL

New nav section. Deeper cosmos/midnight palette. No interactive features — purely informational. Print button prominent.

**Sections (collapsible accordion, each full step-by-step guide):**

1. **Digital Hygiene Basics** — phone permissions, metadata, PINs vs biometrics, VPN reality, phishing
2. **Communication Security Ladder** — SMS → WhatsApp/iMessage → Signal → Briar → in person. What's protected at each tier.
3. **For Journalists: Protecting Sources** — SecureDrop, document metadata, shield laws, CPJ
4. **For Activists: Operational Security** — threat modeling, phone security at protests, encrypted storage, NLG hotline
5. **For Whistleblowers: Before You Disclose** — legal protections FIRST, lawyer BEFORE disclosing, secure evidence, choose channel
6. **What Surveillance Looks Like** — Stingrays, plate readers, facial recognition, social media monitoring, smart home devices, EFF Atlas
7. **For Undocumented Community Members** — public posts warning, trusted intermediary posting, Signal for contact, Know Your Rights resources

Footer note: "This information is provided in good faith. Laws and technology change. Verify critical details with current sources."

---

### 18. EXPANDED SAFETY SECTION

Carry forward all v2 Safety. Add:

**Grooming & Predatory Generosity:**
- Patterns: love bombing, manufactured urgency, isolation, building debt, boundary testing
- "Trust takes time. Someone who wants to help with everything, right away, deserves more scrutiny, not less."

**Safe Exchange Zones:** Police station exchange programs, library/community center lobbies. Never invite stranger home first.

**Stalking via Post Patterns:** "Be mindful of how much your posts reveal about your routine and schedule over time."

**DV Safety:** Use unconnected handle, don't post real location, thehotline.org link, "Are you safe?" footer link.

**Verification Guidance:** "Before any in-person exchange, consider a brief phone or video call."

**Time Bank Labor Fairness:** "One hour equals one hour, but consider physical demands. You're never obligated to accept an exchange that feels unequal."

**Active Helper Visibility:** If handle has 10+ offers in current month, subtle badge: "Active helper — [N] offers this month." Informational, not punitive.

**Report Burden:** "If you're being harassed, you don't have to report each post yourself. Ask someone you trust to help."

**Minor Welfare:** "If you believe a minor is using this platform, or if a post suggests a child may be in an unsafe situation, contact local child protective services or call 211."

---

### 19. ABOUT SECTION (REWRITE)

> **What is Root System?**
> A free tool for neighbors helping neighbors. Post what you need, share what you have, keep track of exchanges, and build something together. No accounts, no ads, no cost.
>
> **Who is it for?**
> Anyone. A church with a paper sign-up sheet that needs to go digital. A rural county where the nearest services are far away. A neighborhood where people want to know each other better. If your community helps each other, this tool is for your community.
>
> Root System is designed for adults helping adults. If you are under 18, please connect with a trusted adult, school counselor, or call 211 for services in your area.
>
> **How does time banking work?**
> One hour of your time equals one hour of someone else's. It doesn't matter what the skill is.
>
> **What are Coalitions?**
> Group projects. A tool library, a buying club, a childcare co-op, a community garden team. Create one, list who's involved, invite others. Coalitions require at least 2 members to be visible.
>
> **Privacy and data**
> No accounts. No tracking. No advertising. Data lives in shared browser storage. Posts are public by design. Posts expire after 7 days unless renewed. Use Signal or ProtonMail for private communication.
>
> **Safety**
> The Community Covenant, flagging system, community review process, trust scores, and the Safety section exist to keep this space trustworthy. Flag what concerns you. Appeal if you're wrongly flagged. Block handles you don't want to see. If something feels wrong, stop — you owe no one an explanation.
>
> **This is yours.**
> Fork it. Rename it. Run it for your neighborhood, your congregation, your county, your co-op. Change what needs changing. Keep the good faith of it intact.

---

### 20. FOOTER UPDATE

```
Root System — Community Commons
Free · Open Source · No Ads · 18+
Use It Freely

Are you safe? thehotline.org | In crisis? 988 · Text HOME to 741741 · DV: 1-800-799-7233
```

---

### 21. DATA EXPORT

Button in Settings/About: "Export Community Data" — downloads all shared-storage community data as JSON file.

---

### 22. MINOR USAGE DETECTION

If post body contains language suggesting minor ("I'm 14", "I'm a kid", "my mom can't", "I'm in high school"), display gentle interstitial:

> "It sounds like you might be under 18. This platform is for adults. If you need help:
> **211** — call for local services
> **988** — crisis support
> **Text HOME to 741741**
> A trusted adult — a teacher, counselor, coach, neighbor — can help you get what you need safely."

Does not prevent posting. Provides off-ramp with resources.

---

### 23. PATTERN-LEVEL TRUST DECAY

If handle receives flags on **3+ separate posts** within 30-day window (even if no single post removed), display subtle indicator on all their posts: "⚠ This handle has been flagged on multiple posts recently." Clears after 30 flag-free days. Amber text, factual, not alarming.

---

## DATA ARCHITECTURE

### Personal Storage Keys
```
device-id            → { id: string (UUID), created: timestamp }
covenant-accepted    → { accepted: bool, timestamp, version: string }
user-zip             → { zip, lat, lon, timestamp }
user-handle          → { handle, created }
post-log             → { posts: [timestamps] }
flag-log             → { flags: [timestamps] }
vote-log             → { votes: [timestamps] }
my-posts             → { postIds: [string] }
trust-data           → { score, history: [{event, delta, timestamp}] }
blocked-handles      → { handles: [string] }
flagged-handles      → { handleId: [deviceIds] }
```

### Shared Storage Keys
```
posts:{id}           → { id, type, freeSubtype?, title, body, category, zone, handle, deviceAge, zip, contactInfo, flags, flaggedBy: [{deviceId, deviceAge}], created, expires, status }
exchanges:{id}       → { from, to, hours, description, confirmedBy, timestamp }
flagged-posts:{id}   → { originalPost, flags, appeal?, restoreVotes, upholdVotes, voterIds, appealExpiry }
coalitions:{id}      → { name, description, members, memberCount, created }
tool-suggestions:{id}→ { name, url, description, category, votes, voterIds, submitted }
```

Coalition minimum 2 members to appear in Browse. Trust score in personal storage keyed to device-id. Contact info rendered only on tap. All timestamps ISO. Batch related data.

---

## LANGUAGE & TONE GUIDANCE

- No ideological language outside Covenant
- Remove from v2: "What the market cannot give us" quote, "AI-driven precarity", "No Algorithm · No Ads · No Bosses"
- **Dairy farmer test:** Would a 55-year-old with slow internet feel welcomed?
- **Church potluck test:** Would a church group feel this is for them?
- If it sounds like a manifesto, it doesn't belong outside the Covenant.

---

## HONEST LIMITATIONS (code comments)

```
// KNOWN LIMITATION: No-account architecture means identity is fundamentally
// unverifiable. Clearing storage creates fresh device-id. Deliberate tradeoff
// for privacy and accessibility. Culture is the primary defense.

// KNOWN LIMITATION: Community-only moderation means harmful content visible
// before flagged. Deployment guide should recommend designated community
// reviewer and law enforcement contact plan.

// KNOWN LIMITATION: Age verification is self-reported. Minor usage detection
// is pattern-based with false positives/negatives. Structural defenses (no
// DMs, public posts, contact behind tap-to-reveal) reduce but don't
// eliminate risk to minors.

// KNOWN LIMITATION: Open source means bad-faith forks possible. CC BY-NC-SA
// prevents commercial exploitation but not hateful instances. License
// requires derivatives remain open source, making misuse transparent.

// KNOWN LIMITATION: Pattern-level bad behavior (boundary-testing, irony-as-
// extremism) harder to detect than single post violations. Trust score
// provides gradual visibility. Culture remains primary defense.

// ARCHITECTURE: System degrades gracefully when participation drops.
// Appeals auto-restore after 3 days with restore votes and no upholds.
// Silence biased toward restoration, not suppression.
```

---

*28 sections + comprehension gate + data architecture + design system + accessibility + language guidance. Incorporates lessons from Craigslist, Nextdoor, Facebook Groups, Twitter, Reddit, 4chan, Discord, Pure, FetLife, plus TSPA Safety by Design framework and current moderation research.*

*Built with care. Given freely.*
