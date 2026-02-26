# Root System Relay — Docker image
#
# Requires Node 22.5+ for node:sqlite (built-in, no native compilation).
# Build produces a compiled JS bundle; the container runs it directly.
#
# Build:
#   docker build -t root-system-relay .
#
# Run:
#   docker run -d \
#     -p 8080:8080 \
#     -v /data/relay:/data \
#     -e DB_PATH=/data/relay.db \
#     --name relay \
#     root-system-relay

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

# Only production dependencies (ws, uuid, @noble/*)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Data directory for relay.db — mount a volume here
RUN mkdir -p /data
ENV DB_PATH=/data/relay.db
ENV PORT=8080

EXPOSE 8080

# SIGTERM → graceful shutdown (handled in server.ts)
STOPSIGNAL SIGTERM

CMD ["node", "--no-warnings=ExperimentalWarning", "dist/server.js"]
