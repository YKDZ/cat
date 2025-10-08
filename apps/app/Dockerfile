FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NODE_ENV=production \
    CI=true

RUN corepack enable

FROM base AS builder
WORKDIR /builder

COPY . .

RUN pnpm install --frozen-lockfile \
    && pnpm nx build @cat/app \
    && pnpm build-plugins \
    && pnpm load-plugins \
    && pnpm --filter=@cat/app copy-drizzle

FROM builder AS deployer
WORKDIR /builder

RUN pnpm --filter=@cat/app deploy --prod --no-optional /deployer \
    && pnpm prune --prod --no-optional

FROM node:24-alpine AS runner
ENV NODE_ENV=production

WORKDIR /app 

COPY --from=deployer /deployer/plugins ./plugins/
COPY --from=deployer /deployer/package.json ./
COPY --from=deployer /deployer/node_modules ./node_modules/
COPY --from=deployer /deployer/dist ./dist/
COPY --from=deployer /deployer/drizzle ./drizzle/
COPY --from=deployer /deployer/scripts/docker-health-check.js ./scripts/docker-health-check.js

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD node scripts/docker-check-health.js

EXPOSE 3000

CMD ["node", "dist/server/index.js"]