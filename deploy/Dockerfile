# --- 1. 基础镜像，安装 pnpm 和 turbo ---
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable

RUN pnpm add -g turbo@latest

# --- 2. Installer: 仅根据 lockfile 和 pnpm-workspace.yml 安装依赖 ---
FROM base AS pruner
WORKDIR /repo

COPY . .

RUN turbo prune @cat/app --docker --use-gitignore=false

# --- 3. Builder: 在 pruned 子仓库里安装依赖并构建 ---
FROM base AS builder
WORKDIR /builder

COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /repo/out/json/ ./

RUN pnpm install -r --frozen-lockfile

COPY --from=pruner /repo/out/full/ ./

RUN pnpm --filter=@cat/db db:generate

RUN turbo build --filter=@cat/app

# --- 4. Deployer: 用 pnpm deploy 将所有依赖聚合 ---
FROM builder AS deployer
WORKDIR /builder

RUN pnpm --filter=@cat/app deploy --legacy --prod --no-optional /deployer

RUN pnpm prune --prod --no-optional

# --- 5. Runner: 拷贝运行时产物到最小镜像 ---
FROM node:22-alpine AS runner
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable

ENV NODE_ENV=production

WORKDIR /app
# Prisma
COPY --from=builder /builder/packages/db/prisma ./prisma
COPY --from=builder /builder/packages/db/src/generated/prisma/libquery_engine* /tmp/prisma-engines/

COPY --from=deployer /deployer/plugins ./plugins
COPY --from=deployer /deployer/package.json ./package.json
COPY --from=deployer /deployer/node_modules ./node_modules/
COPY --from=deployer /deployer/dist ./dist

CMD ["pnpm", "run", "docker-entrypoint"]