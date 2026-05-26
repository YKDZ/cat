# @cat/seed

## Overview

* **Modules**: 11

* **Exported functions**: 12

* **Exported types**: 30

## Function Index

### packages/seed/src

### `interpolateEnvVars`

```ts
export const interpolateEnvVars = (obj: unknown, options: { preserveMissing?: boolean }): unknown
```

### `readYamlWithEnv`

```ts
export const readYamlWithEnv = (filePath: string, schema: z.ZodType<T>, options: { preserveMissingEnv?: boolean }): T
```

### `readJson`

```ts
export const readJson = (filePath: string, schema: z.ZodType<T>): T
```

### `loadDevSeed`

```ts
export const loadDevSeed = (seedDir: string, options: LoadDevSeedOptions): LoadedDevSeed
```

### `runSeedPipeline`

```ts
export const runSeedPipeline = async (execCtx: ExecutorContext, loadedSeed: LoadedDevSeed, opts: {
    pluginsDir: string;
    defaultPluginIds?: string[];
    defaultPluginsJsonPath?: string;
    pluginLoader?: PluginLoader;
    cacheDir: string;
    skipVectorization?: boolean;
    skipPluginBootstrap?: boolean;
  }): Promise<DevSeedResult>
```

### `normalizeMemorySeed`

```ts
export const normalizeMemorySeed = (memorySeed: MemorySeed): { name: string; scope: "PROJECT" | "PERSONAL"; items: { ref: string; source: string; translation: string; sourceLanguage: string; translationLanguage: string; }[]; ref?: string | undefined; ownerRef?: string | undefined; }[]
```

### `loadSeedRuntimeEnv`

```ts
/**
 * Load seeder runtime env from preferred env files and make database/cache addresses prefer file values by default.
 *
 * @param options - Load options
 *
 * @returns Load result
 */
export const loadSeedRuntimeEnv = (options: SeedRuntimeEnvOptions): SeedRuntimeEnvLoadResult
```

### `assertSafeDatabaseTarget`

```ts
/**
 * Determine whether a database URL clearly targets development/test.
 *
 * @param databaseUrl - Database URL
 * @param options - Safety options
 *
 * @returns Returns void when reset is allowed
 */
export const assertSafeDatabaseTarget = (databaseUrl: string | undefined, options: DatabaseSafetyOptions)
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
export const truncateAllTables = async (execCtx: ExecutorContext, options: TruncateAllTablesOptions): Promise<void>
```

### packages/seed/src/bootstrap

### `buildLocaleBridgeMaterial`

```ts
/**
 * Build bootstrap memory material and evidence from locale catalogs.
 *
 * @param input - Locale bridge input
 *
 * @returns Locale bridge result
 */
export const buildLocaleBridgeMaterial = async (input: {
  seedDir: string;
  elements: StructuredTranslatableElementInput[];
  catalogs: BootstrapLocaleCatalog[];
  sourceLanguageId: string;
}): Promise<LocaleBridgeResult>
```

### `writeBootstrapRunReport`

```ts
/**
 * Write a bootstrap run report.
 *
 * @param seedDir - Seed dataset directory
 * @param outputPath - Relative or absolute output path
 * @param report - Report payload
 *
 * @returns Absolute report path
 */
export const writeBootstrapRunReport = async (seedDir: string, outputPath: string, report: BootstrapRunReport): Promise<string>
```

### `runBootstrapSourceGraph`

```ts
/**
 * Run bootstrap source collection, locale bridge, and structured diff ingestion.
 *
 * @param input - Bootstrap input
 *
 * @returns Bootstrap result
 */
export const runBootstrapSourceGraph = async (input: RunBootstrapSourceGraphInput): Promise<RunBootstrapSourceGraphResult>
```

## Type Index

* `LocaleBridgeDiagnostic` (type) — Diagnostic emitted by the locale bridge.

* `LocaleMemoryMaterial` (type) — Translation-memory material emitted by the locale bridge.

* `LocaleBridgeResult` (type) — Locale bridge result.

* `BootstrapRunReport` (type) — Bootstrap run report.

* `RunBootstrapSourceGraphInput` (type) — Input for running bootstrap source graph ingestion.

* `RunBootstrapSourceGraphResult` (type) — Result of running bootstrap source graph ingestion.

* `LoadedLocalSeedOverride` (type) — Summary of a loaded local seed override source, excluding config values.

* `LoadDevSeedOptions` (type) — Optional local override settings for loading a development seed.

* `LoadedDevSeed` (type)

* `DevSeedResult` (type)

* `SeedSummary` (type)

* `SeedRuntimeEnvOptions` (type) — Options for loading seeder runtime environment variables.

* `SeedRuntimeEnvLoadResult` (type) — Result of loading seeder runtime environment variables.

* `DatabaseSafetyOptions` (type) — Safety options for database reset.

* `PluginOverride` (type)

* `LocalSeedConfig` (type) — Local seed override config type.

* `SeedConfig` (type)

* `ProjectSeed` (type)

* `GlossarySeed` (type)

* `GlossaryConceptSeed` (type)

* `MemorySeed` (type)

* `MemoryContainerSeed` (type)

* `MemoryItemSeed` (type)

* `ElementsSeed` (type)

* `ElementSeed` (type)

* `UserSeed` (type)

* `BootstrapLocaleCatalog` (type) — Bootstrap locale catalog type.

* `BootstrapProfile` (type) — Bootstrap profile type.

* `DevSeedConfig` (type)

* `CachedChunk` (type) — Single chunk with embedding vector and optional metadata.
