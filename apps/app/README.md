# CAT APP

## Container targets

The application Dockerfile has two explicit capabilities built from one
pruned workspace. `standalone` accepts `prepare-only`, `bootstrap-only`, and
`prepare-and-start` through its container entrypoint. `runtime` is start-only
and rejects preparation and deployment bootstrap commands.

```sh
docker build --target standalone -f apps/app/Dockerfile -t ykdz/cat:latest .
docker build --target runtime -f apps/app/Dockerfile -t ykdz/cat:latest-runtime .
```

Both images run as UID/GID `1001:1001`. Set `DATABASE_URL` and `REDIS_URL`,
mount `/data` for persistent local storage, and use a tmpfs for `/tmp` when
enforcing a read-only root filesystem. The compatible `./storage` default is
linked to `/data/storage`; `/data/storage` and `/tmp` are the writable runtime
paths, while application and plugin files under `/app` remain root-owned and
read-only. The runtime target contains neither migration files, the
database-preparation program, nor the deployment bootstrap CLI. Those
artifacts are added only to the standalone target.

## Local service bootstrap

For a fresh local database, start `compose.local.yaml`, then run
`pnpm --filter @cat/app bootstrap:local` before `pnpm dev`. The command
prepares the local schema and sends a one-shot deployment plan using the
configured `SPACY_SERVER_URL`; the normal development server subsequently
performs only ordinary application-data bootstrap.
