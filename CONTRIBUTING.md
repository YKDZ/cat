# How to contribute

This repo is a monorepo managed by `nx`.

The subpackages are located in:

- `apps/`: Main application
- `packages/`: Shared packages, plugin core, and related utilities
- `packages/@cat-plugin/`: Internal CAT plugins

The primary related technologies and frameworks are:

- [vike](https://vike.dev/): SSR framework
- [vue](https://vuejs.org/): frontend framework
- [hono](https://hono.dev/): web application framework
- [oRPC](https://orpc.dev/): RPC library
- [drizzle](https://orm.drizzle.team/): ORM (PostgreSQL)
- [redis](https://redis.io/): cache database
- [vite](https://vite.dev/): bundler
- [tailwindcss](https://tailwindcss.com/): utility-first CSS framework
- [zod](https://zod.dev/): validation library
- [nx](https://nx.dev/): monorepo manager
- [oxlint](https://oxc.rs/): linter & formatter
- [prettier](https://prettier.io/): formatter

## Local Development

You have two choices for running the CAT app in `apps/app` locally.

### Through Vite dev server (recommended)

1. Install Node.js 24.x
2. Run `pnpm install`
3. Run `docker compose -f apps/app/docker-compose.base.yml up`
4. Run `pnpm exec build-plugins`
5. Run `pnpm exec load-plugins`
6. Create `packages/db/.env` from `packages/db/.env.example`
7. Run `pnpm exec nx drizzle:migrate db`
8. Create `apps/app/.env` from `apps/app/.env.example`
9. Run `pnpm exec nx dev app`
10. Visit `http://localhost:3000`

The default admin email/password account is:

```txt
Email: admin@encmys.cn
Password: password
```

### Through Docker

1. `nx docker:build app`
2. `docker compose -f apps/app/docker-compose.yml up`
3. Visit `http://localhost:3000`

The default admin email/password account is:

```txt
Email: admin@encmys.cn
The password will be printed in the Docker container log
```

## Before Submitting a Pull Request

Please make sure your changes meet the following requirements **before** opening a PR:

### Make sure nx workspace is sync

```bash
pnpm nx sync
```

### Format the code

```bash
pnpm nx run-many --target=format --projects=*
```

### Lint the code

```bash
pnpm nx run-many --target=lint:fix --projects=*
```

Ensure there are no unresolved lint errors or warnings.

### Run TypeScript type checking

```bash
pnpm nx run-many --target=typecheck --projects=*
```

The GitHub workflows `ci.yml` and `full-ci.yml` perform check for the tasks above.
