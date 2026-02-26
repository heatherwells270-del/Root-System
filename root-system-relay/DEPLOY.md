# Deploying the Root System Relay

The relay routes encrypted community traffic between devices. It stores no readable content —
all posts are AES-256-GCM encrypted before they leave the device.

## Requirements

- Docker + Docker Compose (any modern version)
- A public hostname with HTTPS (WSS requires TLS in production)
- Minimum: 512 MB RAM, 1 vCPU, 5 GB disk

## Quick start (local / testing)

```bash
cd root-system-relay
docker compose up --build
```

The relay starts at `ws://localhost:8080`.
Health check: `http://localhost:8080/health`

## Production deployment

### 1. Build and start

```bash
docker compose up -d --build
```

### 2. Put a reverse proxy in front (required for WSS)

The relay speaks plain WebSocket. In production it must sit behind nginx or Caddy
which terminates TLS and proxies the WebSocket connection.

**Caddy (simplest — auto TLS via Let's Encrypt):**

```
relay.yourdomain.com {
    reverse_proxy localhost:8080
}
```

**nginx:**

```nginx
server {
    listen 443 ssl;
    server_name relay.yourdomain.com;

    # TLS — use certbot or your cert provider
    ssl_certificate     /etc/letsencrypt/live/relay.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_read_timeout 3600s;  # WebSocket keep-alive
    }
}
```

### 3. Point the app at your relay

In the app, set the relay URL to `wss://relay.yourdomain.com`.
This is configured in `src/sync/relay.ts` — the `RELAY_URL` constant or
an `.env.local` override (see `.env.local.example`).

### 4. Verify

```bash
curl https://relay.yourdomain.com/health
# → {"status":"ok","uptime":42}
```

## Environment variables

| Variable  | Default         | Description                              |
|-----------|-----------------|------------------------------------------|
| `PORT`    | `8080`          | HTTP port the relay listens on           |
| `DB_PATH` | `./relay.db`    | Path to the SQLite database file         |

## Data persistence

The relay's only persistent state is `relay.db`. This holds:
- Community registry (public keys + encrypted community keys)
- 48-hour encrypted post buffer (ciphertext only — unreadable by relay)
- Key request queue (7-day TTL)
- Nonce table (replay protection, auto-pruned every 5 minutes)

The `relay-data` Docker volume persists this across container restarts.

**To back up:**
```bash
docker cp root-system-relay:/data/relay.db ./relay-backup-$(date +%Y%m%d).db
```

**To restore:**
```bash
docker cp relay-backup-20260101.db root-system-relay:/data/relay.db
docker compose restart relay
```

## Updates

```bash
git pull
docker compose up -d --build
```

The relay process handles SIGTERM gracefully — Docker Compose sends SIGTERM before killing,
so in-flight messages finish before shutdown.

## What the relay stores (and doesn't)

**Stores:**
- Community IDs and planter public keys (community registry)
- Encrypted post blobs (ciphertext, 48h TTL — relay cannot read them)
- Auth nonces (60-second TTL, for replay protection)
- Key distribution queue (planter offline → delivered on reconnect)

**Never stores:**
- Post content (encrypted before leaving device)
- User identity beyond public key
- IP addresses or device fingerprints
- Message metadata beyond community ID

## Scaling

The relay is intentionally minimal. A single process handles hundreds of concurrent
WebSocket connections. For very large communities, run multiple relay instances behind
a load balancer — communities are independent and don't share state.

Multiple communities can use the same relay safely; community keys are end-to-end
encrypted and only members can decrypt them.
