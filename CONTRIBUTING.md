# How to contribute

This repo is a monorepo managed by turborepo.

The sub repo is stored under: 

- `apps/`: The main app
- `packages/`: Some shared packages and plugin-core etc.
- `packages/@cat-plugin/`: Internal CAT plugin

The relating tech and framework are:

- [vike](https://vike.dev/): SSR framework
- [vue](https://vuejs.org/): frontend framework
- [hono](https://hono.dev/): web application framework
- [prisma](https://www.prisma.io/): ORM
- [vite](https://vite.dev/): bundler
- [rollup](https://rollupjs.org/): bundler

# Local Development

You need to have a oidc server for run CAT, as CAT does not provide any username-password login method.

To run `apps/app` locally, you can:

## Through Docker

1. run `pnpm build:docker:app` to build app's docker image from `apps/app/Dockerfile`
2. create `.env` file from `.env.example` in repo root dir `./`
3. run `docker compose up`
4. Visit `http://localhost:${your_port}`.
