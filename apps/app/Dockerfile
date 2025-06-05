# --- 1. Base
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"

RUN corepack enable \
    && pnpm add -g turbo@latest

# --- 2. Installer
FROM base AS pruner
WORKDIR /repo

COPY . .

RUN turbo prune @cat/app --docker --use-gitignore=false \
    # turbo prune remove injectWorkspacePackages from pnpm-lock.yaml
    # https://github.com/vercel/turborepo/discussions/10541
    && sed -i '/^settings:/a \  injectWorkspacePackages: true' ./out/pnpm-lock.yaml \
    && sed -i '/^settings:/a \  injectWorkspacePackages: true' ./out/json/pnpm-lock.yaml

# --- 3. Builder
FROM base AS builder
WORKDIR /builder

COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /repo/out/json/ ./

RUN pnpm install -r --frozen-lockfile

COPY --from=pruner /repo/out/full/ ./

RUN pnpm --filter=@cat/db db:generate \
    && turbo build --filter=@cat/app

# --- 4. Deployer
FROM builder AS deployer
WORKDIR /builder

RUN pnpm --filter=@cat/app deploy --prod --no-optional /deployer \
    && pnpm prune --prod --no-optional

# --- 5. Runner
FROM node:22-alpine AS runner
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NODE_ENV=production

WORKDIR /app

RUN corepack enable

# Prisma
COPY --from=builder /builder/packages/db/prisma ./prisma
COPY --from=builder /builder/packages/db/src/generated/prisma/libquery_engine* /tmp/prisma-engines/

COPY --from=deployer /deployer/plugins ./plugins/
COPY --from=deployer /deployer/package.json ./
COPY --from=deployer /deployer/node_modules ./node_modules/
COPY --from=deployer /deployer/dist ./dist/

CMD ["pnpm", "run", "docker-entrypoint"]