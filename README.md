# Root System
### A Mutual Aid Network, Time Bank & Knowledge Commons

---

A free, open-source tool for neighbors helping neighbors.

Post what you need. Share what you have. Keep track of who helped whom. Build something together.

---

## What It Does

- **Needs & Offers** — post skills, goods, food, rides, care, knowledge, or anything your community shares
- **Time Bank** — one hour of help equals one hour of help, no matter what the skill is
- **Coalitions** — organize group projects: buying clubs, tool libraries, care pods, carpools *(Phase 2)*
- **Knowledge Archive** — community-written guides, how-tos, and local know-how *(Phase 3)*
- **Crisis Resources** — hotlines, food assistance, legal aid, mental health support — always visible, no sign-up required

---

## Who It's For

Anyone. A church that already does this with paper sign-up sheets. A rural county where the nearest services are an hour away. A neighborhood where people don't know each other yet. A group of parents organizing childcare swaps. A community that's been doing mutual aid longer than the term has existed.

If your people help each other, this tool is for your people.

---

## Architecture

Root System V3 is a **React Native mobile app** (Expo) with a lightweight **WebSocket relay server** (Node.js). Posts and community data are stored locally on each device in SQLite — the relay is a temporary encrypted buffer, not a database.

```
Mobile App (iOS/Android)
  └── SQLite (local storage)
  └── SecureStore (Ed25519 private key)
  └── Relay Client (WebSocket)
         ↕  encrypted post blobs only
Root System Relay (Node.js)
  └── In-memory buffer (AES-256-GCM encrypted)
  └── Community key brokering (X25519 ECDH)
  └── Challenge-response auth (Ed25519)
```

**No central authority holds your data.** The relay can go offline and your community's history survives on member devices.

Full architecture details: [V3-Architecture](./V3-Architecture.md)
Security analysis: [V3-Threat-Model](./V3-Threat-Model.md)

---

## Current Status

### Complete
- Ed25519 identity (private key stays in device SecureStore, never transmitted)
- AES-256-GCM relay buffer encryption
- Community key distribution via X25519 ECDH (planter → members)
- SQLite local storage with CRDT conflict resolution
- Delta sync with watermarks (only fetch what you haven't seen)
- Covenant gate (18+ confirmation, community compact, crisis resources)
- Browse feed with type and category filters
- Post creation (three-card type selector, progressive disclosure)
- Time bank (balance, exchange log, mutual confirmation, dispute)
- Community review and moderation (flagging, appeals)
- My Root (profile, settings)

### In Progress / Next
- **Phase 2** — Coalitions (sub-groups within a community)
- **Phase 3** — Knowledge Archive (community-contributed guides)
- **Phase 4** — WebRTC device-to-device sync (relay fallback)
- **Phase 5** — Trust scores (computed from exchange history)
- **Phase 6** — Contact reveal, recovery email

---

## Running It

### Development (app + relay)

```bash
# Terminal 1 — relay
cd root-system-relay
npm install
npm run dev
# → relay listening on ws://localhost:8080

# Terminal 2 — app
cd root-system-app
npm install
npx expo start
# → scan QR code with Expo Go on your phone
```

Create `root-system-app/.env.local`:
```
EXPO_PUBLIC_RELAY_URL=ws://localhost:8080
```

Requirements:
- Node.js 22.5+ (required for `node:sqlite`)
- Expo Go app (Android or iOS)

### Deploying Your Own Relay

The relay is a single Node.js process. Point it at any host that supports WebSockets:

```bash
cd root-system-relay
npm install
npm run build
node dist/server.js
```

Set `EXPO_PUBLIC_RELAY_URL=wss://your-relay-host.com` for production builds.

---

## Privacy & Data

- No accounts. No emails collected. No passwords.
- No tracking, analytics, cookies, or behavioral data.
- No ads. Structurally prohibited by the license.
- Private key never leaves your device (stored in hardware-backed SecureStore).
- Posts are public within your community by design — this is a community board.
- Data lives in local SQLite on your device. The relay holds only encrypted blobs.
- Location is approximate — neighborhood precision, never exact coordinates.
- You can export all your data or delete everything at any time from My Root → Settings.

For high-risk situations, users should consider [Tor Browser](https://www.torproject.org) and [EFF's Surveillance Self-Defense guide](https://ssd.eff.org).

---

## Safety

- **Community Covenant** — users affirm shared values before entering
- **18+ confirmation** — explicit, non-bypassable
- **Crisis resources on every screen** — 988, Crisis Text Line (741741), DV hotline (1-800-799-7233), always visible
- **Community flagging** — posts flagged by 3 members are automatically removed
- **Appeals** — wrongly flagged posts can be appealed and restored by community vote
- **No internal messaging** — contact happens off-platform, reducing grooming and exploitation risk
- **Approximate location only** — neighborhood-level, never street address
- **No plaintext private keys** — ever, anywhere outside device SecureStore

Safety incidents should be reported to law enforcement or community safety organizations immediately.

---

## License

[CC BY-NC-SA 4.0](./License) — Use it, change it, share it. Don't sell it, don't charge for it, don't add ads.

---

## Terms of Service

Short version: [TOS-Short.md](./TOS-Short.md)
Full version: [TOS-Long.md](./TOS-Long.md)

---

## Contributing

See [Contributing](./Contributing.md)

---

## Background

This was built during a period of short-term disability and given away freely. It is not a product and it is not for sale. It belongs to whoever needs it.

Take it. Use it. Give it to your community. Change what needs changing. Keep the good faith of it intact.

---

*Built with care. Given freely.*
