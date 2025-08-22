# How to contribute

This repo is a monorepo managed by nx.

The sub repo is stored under:

- `apps/`: The main app
- `packages/`: Some shared packages and plugin-core etc.
- `packages/@cat-plugin/`: Internal CAT plugin
- `e2e/`: e2e test packages

The relating tech and framework are:

- [vike](https://vike.dev/): SSR framework
- [vue](https://vuejs.org/): frontend framework
- [hono](https://hono.dev/): web application framework
- [tRPC](https://trpc.io/): RPC library
- [prisma](https://www.prisma.io/): ORM (postgresql)
- [redis](https://redis.io/): cache database
- [vite](https://vite.dev/): bundler
- [unocss](https://unocss.dev/): atom css library
- [zod](https://zod.dev/): validation library
- [rollup](https://rollupjs.org/): bundler
- [nx](https://nx.dev/): monorepo manager

## Local Development

To run CAT APP in `apps/app` locally, you can:

### Through vite development server

1. install Nodejs 22
2. create `/apps/app/.env` file from `/apps/app/.env.example`
3. run `pnpm install`
4. run `pnpm nx dev --project=@cat/app`
5. visit `http://localhost:${your_port}`.

### Through Docker

1. run `pnpm nx docker:build --project=@cat/app` to build app's docker image from `apps/app/Dockerfile`
2. create `/apps/app/.env` file from `/apps/app/.env.example`
3. run `docker compose up` for `docker-compose.yml`
4. visit `http://localhost:${your_port}`.

### Email & Password

Default admin email-password account is:

```txt
Email: admin@encmys.cn
Password: password
```
