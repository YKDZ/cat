# CAT APP

## Container targets

The application Dockerfile has two explicit capabilities built from one
pruned workspace. `standalone` prepares PostgreSQL migrations and starts CAT;
it also accepts `prepare-only` for a separate migration job. `runtime` is
start-only and rejects preparation commands.

```sh
docker build --target standalone -f apps/app/Dockerfile -t ykdz/cat:latest .
docker build --target runtime -f apps/app/Dockerfile -t ykdz/cat:latest-runtime .
```

Both images run as UID/GID `1001:1001`. Set `DATABASE_URL` and `REDIS_URL`,
mount `/data` for persistent local storage, and use a tmpfs for `/tmp` when
enforcing a read-only root filesystem. The compatible `./storage` default is
linked to `/data/storage`; application and plugin files under `/app` remain
root-owned and read-only. The runtime target contains neither the migration
files nor the database-preparation program.
