# --- 1. 基础镜像，安装 pnpm 和 turbo ---
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable

RUN pnpm add -g turbo@latest

# --- 2. Pruner: 生成针对 apps/app 的子仓库和 pruned lockfile ---
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune @cat/app --docker --use-gitignore=false

# --- 3. Installer: 在 pruned 子仓库里安装依赖并构建 ---
FROM base AS builder
WORKDIR /builder

# 先复制 pruned 子仓库的 package.json/lockfile
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /repo/out/json/ ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

# 关键修改：安装所有依赖（包括开发依赖）
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile

# 复制完整的子仓库代码
COPY --from=pruner /repo/out/full/ ./

# 生成 prisma 客户端
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter=@cat/db db:generate

# 构建 apps/app（此时已包含 Vite 等开发依赖）
RUN --mount=type=cache,id=turbo-cache,target=/repo/.turbo \
    turbo build --filter=@cat/app

# 裁剪
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm prune --prod --no-optional

# --- 4. Dependencies: 拷贝运行时依赖 ---
FROM builder AS deployer
WORKDIR /builder

RUN pnpm --filter=@cat/app deploy --legacy --prod --no-optional /deployer

# --- 5. Runner: 拷贝运行时产物到最小镜像 ---
FROM node:22-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app
COPY --from=deployer /deployer/node_modules ./node_modules
COPY --from=deployer /deployer/dist ./dist
COPY --from=deployer /deployer/package.json ./package.json
COPY --from=deployer /deployer/plugins ./plugins
# 重要依赖
COPY --from=builder /builder/packages/db/src/generated/prisma/libquery_engine* /tmp/prisma-engines/


CMD ["node", "dist/server/index.js"]