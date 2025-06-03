# --- 1. Base
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable

RUN pnpm add -g turbo@latest

# --- 2. Installer
FROM base AS pruner
WORKDIR /repo

COPY . .

RUN turbo prune @cat/app --docker --use-gitignore=false

# --- 3. Builder
FROM base AS builder
WORKDIR /builder

COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /repo/out/json/ ./

RUN pnpm install -r --frozen-lockfile

COPY --from=pruner /repo/out/full/ ./

RUN pnpm --filter=@cat/db db:generate

RUN turbo build --filter=@cat/app

# --- 4. Deployer
FROM builder AS deployer
WORKDIR /builder

RUN pnpm --filter=@cat/app deploy --legacy --prod --no-optional /deployer

RUN pnpm prune --prod --no-optional

# --- 5. Runner
FROM node:22-alpine AS runner
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable

ENV NODE_ENV=production

WORKDIR /app
# Prisma
COPY --from=builder /builder/packages/db/prisma ./prisma
COPY --from=builder /builder/packages/db/src/generated/prisma/libquery_engine* /tmp/prisma-engines/

COPY --from=deployer /deployer/plugins ./plugins/
COPY --from=deployer /deployer/package.json ./
COPY --from=deployer /deployer/node_modules ./node_modules/
COPY --from=deployer /deployer/dist ./dist/

CMD ["pnpm", "run", "docker-entrypoint"]