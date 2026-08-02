# syntax=docker/dockerfile:1

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

# Keep the package graph separate from application sources so dependency
# installation remains reusable across source-only changes.
FROM base AS pruner
COPY --parents package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY --parents apps/*/package.json packages/*/package.json @cat-plugin/*/package.json tools/*/package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --filter=cat-root --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm exec turbo prune @cat/app --docker

FROM base AS build
COPY --from=pruner /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
COPY --from=pruner /repo/tsconfig.json ./
COPY --from=pruner /repo/oxlint.config.ts /repo/oxfmt.config.ts ./
RUN --mount=type=secret,id=turbo_team,required=false \
    --mount=type=secret,id=turbo_token,required=false \
    --mount=type=secret,id=turbo_remote_cache_signature_key,required=false \
    export TURBO_TEAM="$(cat /run/secrets/turbo_team 2>/dev/null || true)" && \
    export TURBO_TOKEN="$(cat /run/secrets/turbo_token 2>/dev/null || true)" && \
    export TURBO_REMOTE_CACHE_SIGNATURE_KEY="$(cat /run/secrets/turbo_remote_cache_signature_key 2>/dev/null || true)" && \
    pnpm exec turbo run build --filter=@cat/app && \
    pnpm --filter @cat/app copy-drizzle && \
    pnpm --filter @cat/app deploy --prod /application-release && \
    install -d /standalone-deployment && \
    mv /application-release/dist/bootstrap-only /standalone-deployment/bootstrap-only && \
    rm -rf /application-release/scripts \
      /application-release/drizzle \
      /application-release/compose.yaml \
      /application-release/compose.local.yaml \
      /application-release/compose.services.yaml \
      /application-release/Dockerfile \
      /application-release/Dockerfile.dockerignore
RUN install -d /database-preparation && \
    cp apps/app/scripts/prepare-database.mjs /database-preparation/prepare-database.mjs && \
    cp apps/app/dist/database-preparation/database-requirements.mjs /database-preparation/database-requirements.mjs && \
    cp -r apps/app/drizzle /database-preparation/drizzle

# Both final targets inherit this exact root-owned application runtime.
FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS application-runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --home-dir /app --shell /usr/sbin/nologin app && \
    install -d -o root -g root -m 0755 /app/plugins && \
    install -d -o app -g nodejs -m 0750 /data /data/storage && \
    ln -s /data/storage /app/storage
COPY --from=build /application-release/ ./
COPY --chmod=755 --from=build /repo/apps/app/scripts/container-entrypoint-runtime.sh /usr/local/bin/container-entrypoint
COPY --from=build /repo/apps/app/scripts/container-runner.mjs /usr/local/bin/container-runner.mjs
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
COPY --from=build /standalone-deployment/bootstrap-only /app/dist/bootstrap-only
COPY --chmod=755 --from=build /repo/apps/app/scripts/container-entrypoint-standalone.sh /usr/local/bin/container-entrypoint
ARG DEPLOYMENT_BUILD_ID
LABEL org.opencontainers.image.version="${DEPLOYMENT_BUILD_ID}" \
    org.opencontainers.image.description="CAT standalone application with database preparation"
CMD ["prepare-and-start"]

FROM application-runtime AS runtime
ARG DEPLOYMENT_BUILD_ID
LABEL org.opencontainers.image.version="${DEPLOYMENT_BUILD_ID}" \
    org.opencontainers.image.description="CAT start-only application runtime"
CMD ["start-only"]
