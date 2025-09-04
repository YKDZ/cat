FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NODE_ENV=production

RUN corepack enable \
    && pnpm add --global nx

FROM base AS builder
WORKDIR /builder

COPY . .

RUN pnpm install --frozen-lockfile \
    && pnpm build-internal-plugins \
    && pnpm load-internal-plugins \
    && nx build @cat/app

FROM builder AS deployer
WORKDIR /builder

RUN pnpm --filter=@cat/app deploy --prod --no-optional /deployer \
    && pnpm prune --prod --no-optional

FROM node:22-alpine AS runner
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NODE_ENV=production

WORKDIR /app 

RUN corepack enable

COPY --from=deployer /deployer/plugins ./plugins/
COPY --from=deployer /deployer/package.json ./
COPY --from=deployer /deployer/node_modules ./node_modules/
COPY --from=deployer /deployer/dist ./dist/

CMD ["pnpm", "run", "docker-entrypoint"]