# Root System — Threat Model & Platform Lessons
### What Big Tech Learned the Hard Way (And What We Build For)
*February 24, 2026*

---

## How to Read This Document

Every major platform ran into problems they didn't anticipate. Most of those problems weren't technical — they were human. This document maps the known failure modes of community platforms against Root System's current architecture, identifies gaps, and recommends solutions.

Organized by: what went wrong → where it went wrong → does Root System have this problem → what to do about it.

---

## SECTION 1: TRUST & SAFETY LESSONS

### 1.1 Craigslist — Exploitation & Crime

**What happened:** Craigslist became a vector for sex trafficking, scams, robbery meetups, and housing discrimination. Minimal moderation. "Personals" section shut down entirely after FOSTA-SESTA (2018).

**Root System exposure:**
- ✅ ALREADY ADDRESSED: No internal messaging (reduces grooming/exploitation channels)
- ✅ ALREADY ADDRESSED: FOSTA-SESTA compliant, explicit prohibition in Covenant
- ✅ ALREADY ADDRESSED: No "personals" or social/dating category
- ✅ ALREADY ADDRESSED: Community flagging with auto-removal at 3 flags
- ⚠️ GAP: **Scam post patterns** — Craigslist scams follow templates (too-good-to-be-true offers, urgency language, requests to move off-platform immediately). We have red flags in the Safety section but no **pattern detection** on posts themselves.
- ⚠️ GAP: **Meetup safety** — Craigslist had no guidance on safe exchanges. We have Safe Exchange Protocol but could strengthen it.

**Recommendations:**
- Add **soft warnings on posts** that match common scam patterns: posts containing dollar amounts, posts mentioning Venmo/CashApp/Zelle, posts with ALL CAPS urgency language. Not auto-removal — just a subtle community note: "This post contains patterns sometimes associated with scams. Exercise normal caution."
- Add **Safe Exchange Zones** to the Tool Directory — link to police station parking lot exchange programs (many departments offer these), library lobbies, etc. Encourage communities to designate their own.

---

### 1.2 Nextdoor — Racial Profiling & Neighbor Warfare

**What happened:** Nextdoor's "suspicious activity" reports became a racial profiling tool. "Suspicious person" posts disproportionately targeted Black and brown neighbors. Neighborhood drama escalated into harassment campaigns. Power users dominated conversations and drove out newcomers.

**Root System exposure:**
- ✅ ALREADY ADDRESSED: Hate speech standard grounded in federal civil rights law (Covenant)
- ✅ ALREADY ADDRESSED: No "suspicious activity" or "crime" category
- ⚠️ GAP: **Coded language** — Nextdoor's problem wasn't slurs. It was "I saw someone who didn't look like they belonged." Coded racial language evades keyword filters entirely.
- ⚠️ GAP: **Power user dominance** — In any community, a small number of people post the most. Without checks, they set the tone and can push others out.
- ⚠️ GAP: **Neighbor feuds** — When community members have personal conflicts, the platform becomes the battlefield. Flag systems get weaponized for personal grudges.

**Recommendations:**
- The **appeal mechanism** already addresses flag weaponization. Good.
- Add to the Covenant or Safety section: a note about coded language. Not a rule (unenforceable) but a community norm: "Describing people by race, ethnicity, or appearance in posts about concerns or needs is not appropriate here."
- **Post prominence rotation** — don't let high-volume posters dominate Browse. Consider: newest posts first (already default), but also a "boost" for first-time posters so new community members feel seen.
- Rate limiting (already planned at 5/day) naturally constrains power users. Good.

---

### 1.3 Facebook Groups — Misinformation & Admin Capture

**What happened:** Facebook Groups became misinformation superspreaders. Group admins had unchecked power — could ban members, delete posts, promote their own content. MLM recruiters and scammers targeted community groups. Anti-vax, conspiracy, and extremist content flourished in "health" and "parenting" groups.

**Root System exposure:**
- ✅ ALREADY ADDRESSED: No admin role. No one has elevated permissions. Community governance via voting.
- ✅ ALREADY ADDRESSED: No algorithmic amplification. No "engagement" optimization. Posts appear chronologically.
- ⚠️ GAP: **Misinformation in the Knowledge Archive** — If community members can contribute guides, bad medical/legal/financial advice will appear. "Drink bleach to cure X" is a real pattern.
- ⚠️ GAP: **MLM/recruitment hijacking** — Someone posts "I can teach you financial freedom" or "health and wellness opportunity" — technically not violating any rule but it's multilevel marketing recruitment using the mutual aid frame.
- ⚠️ GAP: **Coalition capture** — A coalition (group project) could be taken over by one person who uses it for personal promotion.

**Recommendations:**
- Knowledge Archive contributions should carry a **visible disclaimer**: "Community-contributed. Not professional advice. Verify medical, legal, and financial information with qualified professionals."
- Add to the Covenant a specific line: "This space is not for recruitment, sales pitches, or business promotion, including multilevel marketing. Offers must be genuine exchanges of skills, goods, or time — not funnels to paid products or services."
- Coalition member lists are public (already planned). If a coalition has only one active member, it's effectively a personal post. Consider: coalitions require a minimum of 2 listed members to be visible in Browse.

---

### 1.4 Twitter/X — Coordinated Harassment & Dogpiling

**What happened:** Targeted harassment campaigns where many users simultaneously attack one person. Weaponized reporting (mass-flagging to get someone removed). Quote-tweet dunking turned individuals into public targets. Coordinated inauthentic behavior (bot networks, sock puppets).

**Root System exposure:**
- ✅ ALREADY ADDRESSED: No retweet/share/amplification mechanism. No way to "dunk" on someone's post.
- ✅ ALREADY ADDRESSED: Flag abuse prohibited in Covenant and TOS
- ✅ ALREADY ADDRESSED: Appeal mechanism for wrongful removal
- ⚠️ GAP: **Coordinated flag attacks** — A group of people (or one person clearing storage to generate new device IDs) could coordinate to flag someone's legitimate posts.
- ⚠️ GAP: **Sock puppets** — No accounts means low barrier to creating multiple identities. One person could create many "devices" (private browsing, different browsers, clearing storage) and vote/flag as multiple people.

**Recommendations:**
- The 3-flag threshold is currently quite low. Consider: flags from devices created in the last 24 hours carry **half weight** (need 6 new-device flags to remove). This means someone spinning up fresh sessions to flag-bomb needs twice as many attempts.
- **Flag source diversity check**: if all 3 flags on a post come from devices created within the same hour, auto-escalate to appeal rather than auto-removing.
- Be honest in documentation: "Root System has no accounts, which means identity verification is limited. This is a deliberate tradeoff for privacy and accessibility. The community's culture is its primary defense."
- **This is a fundamental limitation of the no-account architecture and should be openly acknowledged, not hidden.**

---

### 1.5 Reddit — Mod Burnout & Community Decay

**What happened:** Volunteer moderators burned out. When mods left, communities decayed. Brigading (outsiders flooding a community to disrupt it). Subreddit capture (bad actors becoming mods and reshaping community norms).

**Root System exposure:**
- ✅ ALREADY ADDRESSED: No moderators to burn out. Community governance is distributed.
- ✅ ALREADY ADDRESSED: No way to "brigade" — there's no linking mechanism to direct outsiders to specific posts.
- ⚠️ GAP: **Community Review fatigue** — The appeal mechanism requires community members to vote. If nobody votes, appeals expire and wrongly flagged posts stay hidden forever.
- ⚠️ GAP: **Governance participation decay** — Over time, fewer people will engage with the Community Review tab. This is inevitable.

**Recommendations:**
- **Lower the appeal restore threshold over time**: if after 3 days an appeal has any restore votes and zero uphold votes, auto-restore. The silence itself is a signal.
- Consider a **"Community Review needs you"** gentle indicator on the nav — a small dot or number showing pending appeals. Not intrusive, just visible.
- Accept that some governance participation decay is natural. The system should degrade gracefully — biased toward restoring content rather than keeping it hidden when participation is low.

---

## SECTION 2: GROWTH & SCALING LESSONS

### 2.1 The Eternal September Problem

**What it is:** When a community grows past its original culture-setters, newcomers who don't understand the norms flood in and change the culture. Named after September 1993 when AOL opened Usenet access to millions of new users.

**Root System exposure:**
- ✅ PARTIALLY ADDRESSED: Hand-to-hand distribution strategy means slow, controlled growth
- ✅ PARTIALLY ADDRESSED: Covenant wall creates a friction point for newcomers
- ⚠️ GAP: If Root System goes viral (TikTok, news coverage, Reddit post), thousands of strangers arrive at once. The Covenant wall is a speed bump, not a wall — people will click through without reading.

**Recommendations:**
- **Covenant scroll-to-bottom requirement is essential** — don't let people accept without scrolling. Already planned.
- Consider: **Covenant comprehension check**. After reading, ask one simple question: "What should you do if you witness a safety incident?" with two options. Not a quiz — just confirmation they read the key points. This adds 10 seconds of friction but dramatically increases the chance they actually read it.
- **Launch to 50 people first, let culture set for 2-4 weeks, then expand.** Already in the distribution plan. This is the most important defense.
- Document in the deployment guide: "If your instance suddenly gets a lot of attention, the most important thing you can do is be present in Community Review for the first two weeks."

---

### 2.2 Data Architecture Scaling

**Current architecture:** `window.storage` (persistent browser storage). No backend.

**Where this breaks:**
- When a community exceeds ~500 active posts, client-side storage gets slow
- When shared storage exceeds size limits (5MB per key)
- When you need data durability (what if the storage provider has an outage?)
- When multiple deployments want to federate (share posts across communities)

**This is a known, accepted limitation.** The no-backend architecture is a deliberate choice for accessibility, privacy, and ease of deployment. But the path to scaling needs to be documented.

**Recommendations:**
- **Already planned:** Supabase setup guide in docs for communities that need to scale
- Add to README or scaling guide: honest thresholds — "This architecture works well for communities up to ~200 active members and ~500 active posts. Beyond that, consider the Supabase migration path."
- **Future consideration (not v3):** Federation protocol. Multiple Root System instances that can optionally share posts across communities. This is a v4/v5 feature but the data architecture should not make it impossible. Use consistent data schemas now so federation is additive later, not a rewrite.

---

### 2.3 The Yelp Problem — Extortion Via Reviews

**What it is:** Yelp's review system was weaponized. Competitors left fake negative reviews. Businesses were extorted ("pay us or we'll leave bad reviews"). Review bombing campaigns targeted businesses for political reasons.

**Root System parallel:** The trust score system could be weaponized. Coordinated flagging tanks someone's trust score. Someone with a grudge flags every post from a specific handle.

**Already partially addressed by:**
- Appeal mechanism
- Flag rate limiting (20/day)
- Trust score recovery via successful appeals (+1.0)

**Additional recommendations:**
- **Flag diversity requirement for trust score impact:** A flag only affects trust score if it comes from a device that has NOT previously flagged the same handle. This prevents one person repeatedly tanking someone's score.
- **Trust score floor of 2.0 rather than 0.0** — even at the worst, someone can still participate. A 0.0 score effectively excommunicates someone from the community, which is a severe punishment for a system with no identity verification. 2.0 signals "caution" without exile.

---

## SECTION 3: LEGAL & REGULATORY LESSONS

### 3.1 Section 230 & Platform Liability

**The law:** Section 230 of the Communications Decency Act protects platform operators from liability for user-generated content. This is Root System's primary legal shield.

**What threatens it:**
- If the platform itself creates or materially contributes to illegal content
- If the platform has actual knowledge of specific illegal content and fails to act
- Federal criminal law (Section 230 doesn't protect against federal crimes)
- FOSTA-SESTA (2018) carved out sex trafficking from Section 230 protection

**Root System's position:**
- H is the architect, not the operator of any deployment
- CC BY-NC-SA license and public repo document intent
- Each community deployment has its own operator (the person who forked it)
- The flagging system, Covenant, and safety infrastructure demonstrate good faith efforts to prevent misuse

**Recommendations:**
- **Document this explicitly** in a `docs/LEGAL-POSITION.md` file — not legal advice, but a clear statement of the architecture's legal reasoning. This protects H and it protects community deployers.
- Include a note for community deployers: "By deploying an instance of Root System, you are the operator of that instance. You are responsible for responding to reports of illegal content in your community."

---

### 3.2 COPPA — Children's Online Privacy

**The law:** Children's Online Privacy Protection Act prohibits collecting personal information from children under 13 without parental consent.

**Root System exposure:** No accounts and no data collection means minimal COPPA exposure. However:
- Posts are user-generated content that could contain personal information
- A child could post their phone number or address in a post

**Recommendations:**
- Add to Covenant: "By posting, you confirm you are 13 years of age or older."
- This is a standard protection. Simple to add, meaningful for legal defensibility.

---

### 3.3 Fair Housing Act — Housing Posts

**What happened:** Craigslist and Facebook Marketplace both faced lawsuits over housing discrimination. Users posted "no Section 8," "Christian household only," discriminatory preferences in housing listings.

**Root System exposure:** If people post housing needs/offers (spare rooms, temporary housing, roommate searches), discriminatory language is possible.

**Recommendations:**
- In the post form, if category = "Housing": show a brief note: "Fair housing laws prohibit discrimination based on race, color, religion, sex, national origin, disability, or family status in housing-related posts."
- This is a low-cost, high-value protection. It's educational and legally defensive.

---

### 3.4 ADA / WCAG — Accessibility Compliance

**The law:** Americans with Disabilities Act and Web Content Accessibility Guidelines. Increasingly, courts are ruling that websites must be accessible to people with disabilities.

**Root System exposure:** Current v2 was not built with accessibility as a primary constraint.

**Recommendations (build into v3):**
- All interactive elements must be keyboard-navigable (tab order, enter to activate)
- All images/icons must have alt text or aria-labels
- Color contrast must meet WCAG AA minimum (4.5:1 for text, 3:1 for large text) — the dark palette + gold/parchment text needs checking
- Screen reader compatibility: proper semantic HTML (headings hierarchy, form labels, button text)
- Focus indicators visible on all interactive elements
- Skip-to-content link at top of page
- This is non-negotiable for a tool that says it's for everyone. If a blind person can't use it, the claim is false.

---

## SECTION 4: ABUSE VECTORS SPECIFIC TO MUTUAL AID

### 4.1 Predatory "Generosity"

**What it is:** Someone offers excessive help — free rides, free childcare, free home repairs — to build dependency and trust, then exploits the relationship. This is a documented grooming pattern.

**Root System exposure:** The platform's entire purpose is offering help to strangers. This is the single highest-risk abuse vector.

**Current protections:**
- Trust scores (new accounts start at 5.0, not 10.0)
- Safe Exchange Protocol
- Red flags checklist (already includes "offers that seem too good")

**Recommendations:**
- **Strengthen the red flags section** specifically around predatory generosity: "Someone who offers far more than seems reasonable — especially to people in vulnerable situations — may be building a dependency. Real generosity doesn't come with strings."
- In the Safety section, add: "Trust takes time. Someone who wants to help you with everything, right away, before you know them, deserves more scrutiny, not less."
- **Post frequency + pattern visibility:** If one handle is posting an unusually high volume of offers (especially in categories like childcare, housing, transportation), consider a subtle community indicator: "Active helper — 12 offers this month." Visibility is the protection — the community can judge for itself.

---

### 4.2 Data Harvesting Disguised as Community Building

**What it is:** Someone creates a coalition or posts offers specifically to collect personal information — phone numbers, addresses, schedules, vulnerability details — from community members.

**Root System exposure:**
- Contact info is shared voluntarily per-post
- Coalition member lists are public
- A "community resource drive" coalition could be a data harvesting operation

**Current protections:**
- Tap-to-reveal contact info (reduces automated scraping)
- No persistent user profiles (limits data aggregation)

**Recommendations:**
- In the Covenant or Safety section: "Never share more personal information than necessary for the specific exchange. You do not need to give your home address, work schedule, or family details to exchange a casserole."
- **Coalition creator accountability:** Coalition posts display the creator's handle and trust score prominently. If a coalition creator is flagged or removed, the coalition is automatically hidden pending review.

---

### 4.3 Domestic Violence Weaponization

**What it is:** An abuser uses the platform to locate, monitor, or contact a victim. "I'm looking for [name], we got separated" or monitoring what a victim posts/needs.

**Root System exposure:** Public posts + zip code area could help an abuser locate someone.

**Current protections:**
- No accounts (victims can't be searched by name)
- Zip code only (neighborhood-level, not address)
- No internal messaging

**Recommendations:**
- In the Safety section: "If you are fleeing domestic violence, use a handle that cannot be connected to your real identity. Do not post your real location. Use the crisis resources at the bottom of every page."
- **National DV Hotline is already in resources.** Good.
- Consider: a small, non-intrusive "Are you safe?" link in the footer near crisis resources — links directly to thehotline.org or a safety planning page.
- Posts should never require or encourage real names. The handle system already supports this.

---

### 4.4 Financial Exploitation

**What it is:** Scams, fraud, fake charity drives, "I need money for medical bills" emotional manipulation.

**Root System exposure:**
- No money moves through the platform (core architectural protection)
- But posts could direct people to external payment (Venmo, GoFundMe, etc.)

**Recommendations:**
- **Soft warning on posts mentioning payment platforms:** If a post contains "Venmo," "CashApp," "Zelle," "PayPal," "GoFundMe," "donation," or similar terms, display a subtle note: "Root System is for direct exchanges, not financial transactions. Be cautious with any request involving money."
- Add to Covenant: "This platform is for direct exchanges of skills, goods, time, and support — not for fundraising, financial requests, or directing people to payment platforms."

---

## SECTION 5: THINGS WE HAVEN'T COVERED YET

### 5.1 Internationalization (i18n)

The current build is English-only. If Root System spreads to non-English-speaking communities:
- UI text should be extractable to language files
- Right-to-left language support (Arabic, Hebrew, Farsi)
- Zip code system is US-only — international postal codes work differently

**Recommendation for v3:** Don't build i18n yet, but structure the code so UI strings are in one place (a constants object at the top of the file), not scattered through JSX. This makes future translation possible without rewriting the component.

---

### 5.2 Offline / Low-Connectivity Mode

Rural communities with bad internet. Disaster situations where infrastructure is down.

**Current:** App requires internet for initial load and storage operations.

**Recommendation for v3:** Add a service worker for offline caching of the app shell and static content (Tool Directory, Secure Channel, Safety section, crisis numbers). Posts and time bank require connectivity, but informational content should be available offline. This is a significant accessibility feature for the target audience.

**Recommendation for future:** Progressive Web App (PWA) manifest so users can "install" it on their phone home screen without an app store.

---

### 5.3 Print-First Distribution

Some communities will never use the digital tool. They need paper.

**Current:** Print bulletin mode exists in v2.

**Recommendation for v3:** Expand print mode to generate:
- A one-page community flyer explaining what Root System is + QR code to instance
- Printable post cards (individual posts formatted for bulletin board posting)
- Printable crisis resource cards (wallet-sized)
- Printable Secure Channel guides (the whole section, formatted for paper)

---

### 5.4 Disaster Response Mode

Mutual aid demand spikes during disasters (hurricanes, fires, floods, ice storms). Current architecture may not handle sudden surge.

**Recommendations:**
- Document in deployment guide: "During a disaster, post volume will spike. The client-side storage architecture handles this well because there's no server to overload. But someone should be watching Community Review more frequently."
- Consider a "Disaster/Emergency" post category with a distinct visual treatment — these posts surface at the top of Browse, expire after 7 days automatically, and have a higher flag threshold (5 instead of 3) because disaster posts are more likely to be unusual/urgent.

---

### 5.5 Data Portability & Community Exit

What happens when a community wants to leave Root System and move to something else? Or when a deployment needs to be shut down?

**Recommendations:**
- **Export function:** A button that exports all community posts, time bank records, and coalition data as a JSON file. Communities own their data and can take it with them.
- This is philosophically consistent with the project: it belongs to the community, not the platform.

---

### 5.6 Death of the Architect

What happens to Root System if H is no longer maintaining it?

**Already addressed:**
- Open source (anyone can fork and continue)
- CC BY-NC-SA license (terms survive the creator)
- No backend dependency (deployments don't need H's servers)

**Recommendation:**
- Name 2-3 trusted people as repo maintainers on GitHub. They can merge contributions and respond to issues. This doesn't need to happen now, but before any significant distribution.

---

## SECTION 6: UPDATED GAP SUMMARY

### Add to v3 Build Prompt:
1. Age confirmation in Covenant ("I confirm I am 13 years of age or older")
2. Fair housing note on housing-category posts
3. Anti-MLM/recruitment clause in Covenant
4. Soft warnings on posts mentioning payment platforms
5. Scam pattern soft warnings (dollar amounts, urgency language, payment app names)
6. Accessibility: keyboard navigation, alt text, contrast checking, screen reader support, skip-to-content
7. UI strings in a centralized constants object (i18n preparation)
8. Flag diversity checks (same device can't flag same handle repeatedly, new-device flags carry half weight)
9. Trust score floor of 2.0 instead of 0.0
10. Covenant comprehension check (one simple question after reading)
11. Coalition minimum 2 members to be visible
12. DV safety guidance in Safety section + "Are you safe?" footer link
13. Predatory generosity warnings strengthened
14. Data export function (JSON)

### Add to Documentation (not code):
15. `docs/LEGAL-POSITION.md` — architectural legal reasoning
16. Scaling thresholds in deployment guide (~200 members, ~500 posts)
17. Disaster response guidance for deployers
18. "Name repo maintainers before distribution" checklist item
19. Honest acknowledgment of no-account architecture limitations

### Consider for v4/v5 (not v3):
20. Federation protocol between instances
21. Service worker for offline mode
22. PWA manifest for home screen install
23. Disaster/Emergency post category
24. Full i18n with language files
25. Expanded print distribution (flyers, wallet cards)

---

*This document is the immune system. The code is the body. Both need to be built before the living room opens its doors.*
