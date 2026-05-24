# Seeder

`tools/seeder/main.ts` loads a dataset directory, resets the configured development database, and runs the shared `@cat/seed` pipeline.

By default it loads `apps/app/.env` and lets that file win for `DATABASE_URL` / `REDIS_URL`, which avoids accidentally seeding an old shell target such as `cat_e2e`. If you intentionally want to keep the current shell environment in control, pass `--respect-process-env`.

## Local plugin overrides

Plugin service configuration is often stable on a local machine and may contain private API keys. Keep those values out of dataset files by placing them in an ignored local override file.

Default lookup order:

1. Dataset `seed.yaml` (`plugins.overrides`)
2. `tools/seeder/local/seed.yaml`
3. `<dataset>/seed.local.yaml`
4. Any explicit `--local-overrides <path>` files, in the order passed

Each local file uses the same env interpolation syntax as `seed.yaml`:

```yaml
plugins:
  overrides:
    - plugin: openai-vectorizer
      scope: GLOBAL
      config:
        model-id: "${VECTORIZER_MODEL:-qwen3-embedding:8b}"
        baseURL: "${VECTORIZER_URL:-http://127.0.0.1:11434/v1}"
        apiKey: "${VECTORIZER_API_KEY:-dummy-key}"
```

`config` may be any non-null JSON value accepted by the plugin manifest. Most plugins use an object; dynamic provider plugins such as `openai-llm-provider` and `tei-rerank-provider` may use an array of provider configs.

Overrides are merged by `(plugin, scope, scopeId)`. A later local entry replaces the matching dataset entry; new entries are appended. This keeps dataset data reusable while allowing local plugin config to stay machine-specific.

`tools/seeder/local/`, `*.local.yaml`, and `*.local.yml` are ignored by `tools/seeder/.gitignore`.

Useful flags:

- `--local-overrides <path>`: load an additional local override file.
- `--no-local-overrides`: disable automatic lookup of `tools/seeder/local/seed.yaml` and `<dataset>/seed.local.yaml`.
- `--respect-process-env`: do not override existing `DATABASE_URL` / `REDIS_URL` from `apps/app/.env`; only fill missing keys from the file.
