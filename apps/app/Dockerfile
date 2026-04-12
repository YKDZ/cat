FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NODE_ENV=production \
    CI=true \
    MOON_TOOLCHAIN_FORCE_GLOBALS=true

RUN corepack enable && \
    npm install -g @moonrepo/cli

#### SKELETON — copy everything, then scaffold to separate manifests from sources
FROM base AS skeleton
WORKDIR /app

COPY . .
RUN moon docker scaffold app

#### BUILD — layer-cached dependency install, then build
FROM base AS build
WORKDIR /app

# Copy workspace skeleton (manifests, lockfiles, configs only)
COPY --from=skeleton /app/.moon/docker/workspace .

# Install dependencies (moon uses pnpm under the hood)
RUN moon docker setup

# Copy source files for app and its transitive dependencies
COPY --from=skeleton /app/.moon/docker/sources .

# Build the app and plugins
RUN moon run app:build && \
    pnpm build-plugins && \
    pnpm load-plugins && \
    pnpm --filter=@cat/app copy-drizzle

# Prune non-production files and dependencies
RUN moon docker prune

#### RUNNER — minimal production image
FROM node:24-alpine AS runner
ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/ ./

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD node scripts/docker-health-check.js

EXPOSE 3000

CMD ["node", "dist/server/index.mjs"]