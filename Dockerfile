# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage Dockerfile for Somiti MS (Next.js 16 standalone build).
#
# Stages:
#   1. deps     — install production deps only (cached layer)
#   2. builder  — generate Prisma client + build Next.js (.next/standalone)
#   3. runner   — minimal image with just what's needed at runtime
#
# The standalone build (Next.js output: "standalone") bundles ONLY the JS
# actually imported by the app — no node_modules/ shipped. We copy the
# standalone server, static assets, public/ and prisma/ for runtime migrations.
#
# Build args / env:
#   - DATABASE_URL / DIRECT_URL / NEXTAUTH_SECRET / ENCRYPTION_KEY
#     Required at BUILD time for `next build` to evaluate env-aware code.
#     At RUNTIME they must be re-supplied (Docker -e or K8s secret) — the
#     standalone bundle does NOT bake them in.
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. deps ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install ALL deps (dev + prod) — we need devDeps for `prisma generate` and
# `next build`. The runner image is the one we strip back to prod-only.
COPY package*.json ./
RUN npm ci

# ── 2. builder ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma client must exist BEFORE `next build` so the app can import it.
RUN npx prisma generate

# Build Next.js with the standalone output. The env vars below are required
# for the build-time env evaluation — they're dummies; real secrets are
# supplied at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXTAUTH_URL=http://localhost:3000
ENV NEXTAUTH_SECRET=dummy-build-time-secret
ENV ENCRYPTION_KEY=dummy-build-time-key-base64==
RUN npm run build

# ── 3. runner ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Run as non-root for defense-in-depth (most k8s/Podman policies require this).
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Standalone server (server.js) + static assets + public folder + Prisma
# schema for runtime migrations.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

# Next.js standalone server — single Node process, no PM2 needed. Container
# orchestrators (k8s, ECS) handle restarts.
CMD ["node", "server.js"]
