# @cat/seed

## Overview

* **Modules**: 6

* **Exported functions**: 6

* **Exported types**: 15

## Function Index

### packages/seed/src

### `interpolateEnvVars`

```ts
export const interpolateEnvVars = (obj: unknown): unknown
```

### `readYamlWithEnv`

```ts
export const readYamlWithEnv = (filePath: string, schema: z.ZodType<T>): T
```

### `readJson`

```ts
export const readJson = (filePath: string, schema: z.ZodType<T>): T
```

### `loadDevSeed`

```ts
export const loadDevSeed = (seedDir: string): LoadedDevSeed
```

### `runSeedPipeline`

```ts
export const runSeedPipeline = async (execCtx: ExecutorContext, loadedSeed: LoadedDevSeed, opts: {
    pluginsDir: string;
    defaultPluginsJsonPath: string;
    cacheDir: string;
    skipVectorization?: boolean;
  }): Promise<DevSeedResult>
```

### `truncateAllTables`

```ts
/**
 * TRUNCATE all application tables with CASCADE.
 * Preserves table structure and enum types — only data is cleared.
 *
 * We query pg_tables to get all tables in the current schema,
 * then TRUNCATE them all at once. This avoids hardcoding table names
 * and automatically adapts to schema changes.
 */
export const truncateAllTables = async (execCtx: ExecutorContext): Promise<void>
```

## Type Index

* `LoadedDevSeed` (type)

* `DevSeedResult` (type)

* `SeedSummary` (type)

* `PluginOverride` (type)

* `SeedConfig` (type)

* `ProjectSeed` (type)

* `GlossarySeed` (type)

* `GlossaryConceptSeed` (type)

* `MemorySeed` (type)

* `MemoryItemSeed` (type)

* `ElementsSeed` (type)

* `ElementSeed` (type)

* `UserSeed` (type)

* `DevSeedConfig` (type)

* `CachedChunk` (type) — Single chunk with embedding vector and optional metadata.
