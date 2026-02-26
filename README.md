# Root System
### A Mutual Aid Network, Time Bank & Knowledge Commons

---

A free, open-source tool for neighbors helping neighbors.

Post what you need. Share what you have. Keep track of who helped whom. Build something together.

---

## What It Does

- **Needs & Offers** — post skills, goods, food, rides, care, knowledge, or anything your community shares
- **Time Bank** — one hour of help equals one hour of help, no matter what the skill is
- **Coalitions** — organize sub-groups within your community: buying clubs, tool libraries, care pods, carpools
- **Knowledge Archive** — community-written guides, how-tos, and local know-how, searchable and voted on
- **Community Review** — neighbors flag posts, community votes on appeals; no central moderator
- **Trust Scores** — reputation built from time bank exchange history, shown on post cards
- **Contact Reveal** — encrypted handshake to share contact info directly between two members; never transmitted in plain text
- **Recovery Key** — opt-in, passphrase-protected backup of your identity key; restore your account on any device
- **Crisis Resources** — hotlines, food assistance, legal aid, mental health support — always visible, no sign-up required

---

## Who It's For

Anyone. A church that already does this with paper sign-up sheets. A rural county where the nearest services are an hour away. A neighborhood where people don't know each other yet. A group of parents organizing childcare swaps. A community that's been doing mutual aid longer than the term has existed.

If your people help each other, this tool is for your people.

---

## Architecture

Root System is a **React Native mobile app** (Expo) with a lightweight **WebSocket relay server** (Node.js). Posts and community data are stored locally on each device in SQLite — the relay is a temporary encrypted buffer, not a database. When two devices are online simultaneously, WebRTC handles direct device-to-device sync without touching the relay at all.

```
Mobile App (iOS/Android)
  └── SQLite (local storage, primary)
  └── SecureStore (Ed25519 private key, hardware-backed)
  └── Relay Client (WebSocket, offline push queue)
  └── WebRTC Peer Manager (direct device-to-device sync, native build only)
         ↕  AES-256-GCM encrypted blobs only    ↕  STUN-brokered direct channel
Root System Relay (Node.js)
  └── In-memory buffer (48h TTL, encrypted blobs only)
  └── Community key brokering (X25519 ECDH)
  └── Challenge-response auth + WebRTC signaling (Ed25519 signatures)
```

**No central authority holds your data.** The relay can go offline and your community's history survives on member devices. The relay cannot read any post — everything is encrypted before it leaves your device.

Full architecture details: [V3-Architecture.md](./V3-Architecture.md)
Security analysis: [V3-Threat-Model.md](./V3-Threat-Model.md)

---

## What's Built

Everything is complete. The app compiles clean (`tsc --noEmit` exits 0) and is ready for native build.

- **Identity** — Ed25519 keypair; private key stays in hardware-backed SecureStore, never transmitted
- **Recovery key** — opt-in passphrase-protected backup (PBKDF2-SHA256 + AES-256-GCM); restore on any device
- **Encryption** — AES-256-GCM relay buffer; X25519 ECDH community key distribution
- **Sync** — delta sync with watermarks, offline push queue, real-time sync status badge
- **WebRTC sync** — direct device-to-device sync when relay is unavailable; graceful degradation in Expo Go (relay-only mode)
- **Community flow** — create or join a community with invite codes; planter approves members
- **Covenant gate** — 18+ confirmation, community compact, crisis resources before entry
- **Browse** — post feed with type/category filters, keyword watches, trust score display
- **Post** — three-card type selector (Need / Offer / Both), client-side safety screening, relay push
- **Time Bank** — balance tracking, exchange log, mutual confirmation, dispute flow, 48h auto-expire
- **Community Review** — flagging, 3-flag auto-remove, appeals, community vote to restore
- **Contact reveal** — encrypted handshake to share contact info directly between members; never stored on relay
- **Coalitions** — sub-groups within a community: create, join, leave, archive
- **Knowledge Archive** — community guides: post, vote helpful, flag, search
- **Trust scores** — computed from exchange history, displayed on post cards
- **Block list** — block a neighbor from their post; blocked handles filtered from your feed
- **My Root** — profile, settings, blocked list, demo seed data, full data export/delete
- **Relay server** — WebSocket server with Docker support, heartbeat keep-alive, blob size limits, membership guards

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
npx expo start --clear
# → scan QR code with Expo Go on your phone
```

Create `root-system-app/.env.local`:
```
EXPO_PUBLIC_RELAY_URL=ws://localhost:8080
```
*(For Android emulator use `ws://10.0.2.2:8080` instead of localhost.)*

A `.env.local.example` file is included in the repo as a template.

**Requirements:**
- Node.js 22.5+ (required for `node:sqlite`)
- Expo Go app on Android or iOS for quick development

**WebRTC (device-to-device sync):**
WebRTC requires the `react-native-webrtc` native module, which is not bundled in Expo Go. In Expo Go the app runs in relay-only mode — WebRTC is silently disabled and everything else works normally. To enable direct device-to-device sync, run a native build:

```bash
cd root-system-app
npx expo prebuild
npx expo run:android   # or expo run:ios
```

### Deploying Your Own Relay

The relay ships with a `Dockerfile` and `docker-compose.yml` for easy self-hosting. See [root-system-relay/DEPLOY.md](./root-system-relay/DEPLOY.md) for full instructions.

Quick start without Docker:
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
- Your private key never leaves your device. It is stored in hardware-backed SecureStore and is never transmitted anywhere.
- All posts are encrypted with a community key (AES-256-GCM) before leaving your device. The relay holds only encrypted blobs it cannot read.
- Contact information is never transmitted in plain text — it travels only as an encrypted blob addressed to a specific recipient's public key via X25519 key exchange.
- Recovery key backup is entirely opt-in. It is a passphrase-encrypted string you save yourself — the platform never holds a copy.
- Posts are public within your community by design — this is a community board, not a private inbox.
- Location is approximate — neighborhood precision, never exact coordinates.
- The relay discards all data after 48 hours. Your community's history lives on member devices, not on a server.
- You can export all your data or delete everything at any time from My Root → Settings.

For high-risk situations, users should consider [Tor Browser](https://www.torproject.org) and [EFF's Surveillance Self-Defense guide](https://ssd.eff.org).

---

## Safety

- **Community Covenant** — users affirm shared values before entering; 18+ required
- **Crisis resources on every screen** — 988, Crisis Text Line (741741), DV hotline (1-800-799-7233)
- **Community flagging** — posts flagged by 3 members are automatically removed
- **Appeals** — wrongly flagged posts can be appealed and restored by community vote
- **Client-side safety screening** — scam patterns, crisis language, minor safety, fair housing — runs locally, never on a server
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

See [Contributing.md](./Contributing.md)

---

## Background

This was built during a period of short-term disability and given away freely. It is not a product and it is not for sale. It belongs to whoever needs it.

Take it. Use it. Give it to your community. Change what needs changing. Keep the good faith of it intact.

---

*Built with care. Given freely.*
