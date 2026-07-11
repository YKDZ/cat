# syntax=docker/dockerfile:1.7

ARG DEPLOYMENT_BUILD_ID=local

# check:all builds this target against the real Dockerfile-specific context.
# Its assertions protect credentials and runtime state before COPY . . is used.
FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS context-contract
WORKDIR /context
COPY . .
RUN test ! -e .env && \
    test ! -e apps/app/.env && \
    test ! -e packages/db/.env && \
    test ! -e apps/app/storage && \
    test ! -e .git && \
    test ! -e .pnpm-store && \
    test ! -e .turbo && \
    test ! -e apps/app/node_modules

FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS base
ARG PACKAGE_MANAGER_PIN=pnpm@11.11.0+sha512.4463f65fd80ed80d69bc1d4bf163ee94f605c7380fc318bb5b2ebe15f8cd12d49c51a4d59e951b401e764d3b6ca751cbf51bc50ed7001a6bcb4935e684c34882
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_HOME=/corepack \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
WORKDIR /repo
RUN apt-get update && \
    apt-get install --yes --no-install-recommends g++ make python3 && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable && \
    corepack install --global "${PACKAGE_MANAGER_PIN}"

# Keep dependency resolution in a small, cacheable stage. Turbo owns the
# workspace graph; package manifests remain the only dependency declaration.
FROM base AS pruner
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY patches patches
RUN pnpm fetch
COPY apps/app/package.json apps/app/package.json
COPY packages packages
COPY @cat-plugin @cat-plugin
RUN pnpm install --offline --frozen-lockfile
COPY . .
RUN pnpm exec turbo prune @cat/app --docker

FROM base AS build
COPY --from=pruner /repo/out/json/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/json/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /repo/out/json/package.json ./package.json
COPY --from=pruner /repo/patches ./patches
RUN pnpm fetch
COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --offline --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
COPY --from=pruner /repo/tsconfig*.json ./
COPY --from=pruner /repo/oxlint.config.ts /repo/oxfmt.config.ts ./
RUN pnpm build-plugins && \
    pnpm --filter @cat/app build && \
    pnpm --filter @cat/app copy-drizzle && \
    pnpm --filter @cat/app deploy --prod /application-deploy
RUN install -d /database-preparation && \
    cp apps/app/scripts/prepare-database.mjs /database-preparation/prepare-database.mjs && \
    cp -r apps/app/drizzle /database-preparation/drizzle && \
    rm -rf /application-deploy/drizzle \
      /application-deploy/scripts/prepare-database.mjs

# Both final targets inherit this exact root-owned application runtime.
FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS application-runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --home-dir /app --shell /usr/sbin/nologin app && \
    install -d -o root -g root -m 0755 /app/plugins && \
    install -d -o app -g nodejs -m 0750 /data /data/storage && \
    ln -s /data/storage /app/storage
COPY --from=build /application-deploy/ ./
COPY --chmod=755 --from=build /repo/apps/app/scripts/container-entrypoint.sh /usr/local/bin/container-entrypoint
COPY --chmod=755 --from=build /repo/apps/app/scripts/docker-health-check.js /usr/local/bin/docker-health-check.js
USER 1001:1001
VOLUME ["/data"]
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 CMD node /usr/local/bin/docker-health-check.js
ENTRYPOINT ["/usr/local/bin/container-entrypoint"]

# Preparation exists only in this branch. The runtime target never receives
# migrations or the preparation program.
FROM application-runtime AS database-preparation
COPY --from=build /database-preparation/ /app/.preparation/
ENV PREPARE_DATABASE_COMMAND=/app/.preparation/prepare-database.mjs \
    DRIZZLE_MIGRATIONS=/app/.preparation/drizzle

FROM database-preparation AS standalone
ARG DEPLOYMENT_BUILD_ID
LABEL org.opencontainers.image.version="${DEPLOYMENT_BUILD_ID}" \
    org.opencontainers.image.description="CAT standalone application with database preparation"
ENV CONTAINER_CAPABILITY=prepare-and-start
CMD ["prepare-and-start"]

FROM application-runtime AS runtime
ARG DEPLOYMENT_BUILD_ID
LABEL org.opencontainers.image.version="${DEPLOYMENT_BUILD_ID}" \
    org.opencontainers.image.description="CAT start-only application runtime"
ENV CONTAINER_CAPABILITY=start-only
CMD ["start-only"]
