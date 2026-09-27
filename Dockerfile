# syntax=docker/dockerfile:1
# Tek Dockerfile, iki hedef:
#   docker build --target app    -t my-games-app .
#   docker build --target worker -t my-games-worker .
# İmajlar GitHub Actions'ta build edilir; Coolify sadece hazır imajı çeker.

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.4.2

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/api/package.json packages/api/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r run build

# --- app: SSR + API. Başlarken migration'ları uygular. ---
FROM node:${NODE_VERSION}-alpine AS app
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=256
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.output ./.output
COPY --from=build --chown=node:node /repo/packages/db/dist ./db/dist
COPY --from=build --chown=node:node /repo/packages/db/drizzle ./db/drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["sh", "-c", "node db/dist/migrate.mjs && exec node .output/server/index.mjs"]

# --- worker: pg-boss işleri. Tek dosya, node_modules yok. ---
FROM node:${NODE_VERSION}-alpine AS worker
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=128
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/worker/dist ./
USER node
CMD ["node", "index.mjs"]
