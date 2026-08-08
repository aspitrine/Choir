# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- deps: full install for building ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---- prod-deps: production-only install, used at runtime just to run migrations ----
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile

# ---- build: compile the app (Nitro produces a self-contained .output) ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- runtime ----
FROM node:24-alpine AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.output ./.output
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]
