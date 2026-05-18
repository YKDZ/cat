# Dev Data Seeding

> **Section**: Infra  ·  **Subject ID**: `infra/seed`

**Primary package**: `@cat/seed`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `buildLocaleBridgeMaterial` | function | Build bootstrap memory material and evidence from locale catalogs. |
| `LocaleBridgeDiagnostic` | type | Diagnostic emitted by the locale bridge. |
| `LocaleMemoryMaterial` | type | Translation-memory material emitted by the locale bridge. |
| `LocaleBridgeResult` | type | Locale bridge result. |
| `writeBootstrapRunReport` | function | Write a bootstrap run report. |
| `BootstrapRunReport` | type | Bootstrap run report. |
| `runBootstrapSourceGraph` | function | Run bootstrap source collection, locale bridge, and structured diff ingestion. |
| `RunBootstrapSourceGraphInput` | type | Input for running bootstrap source graph ingestion. |
| `RunBootstrapSourceGraphResult` | type | Result of running bootstrap source graph ingestion. |
| `interpolateEnvVars` | function |  |
| `readYamlWithEnv` | function |  |
| `readJson` | function |  |
| `loadDevSeed` | function |  |
| `LoadedDevSeed` | type |  |
| `runSeedPipeline` | function |  |
| `DevSeedResult` | type |  |
| `SeedSummary` | type |  |
| `assertSafeDatabaseTarget` | function | Determine whether a database URL clearly targets development/test. |
| `DatabaseSafetyOptions` | type | Safety options for database reset. |
| `PluginOverride` | type |  |
| `SeedConfig` | type |  |
| `ProjectSeed` | type |  |
| `GlossarySeed` | type |  |
| `GlossaryConceptSeed` | type |  |
| `MemorySeed` | type |  |
| `MemoryItemSeed` | type |  |
| `ElementsSeed` | type |  |
| `ElementSeed` | type |  |
| `UserSeed` | type |  |
| `BootstrapLocaleCatalog` | type | Bootstrap locale catalog type. |
| `BootstrapProfile` | type | Bootstrap profile type. |
| `DevSeedConfig` | type |  |
| `truncateAllTables` | function | TRUNCATE all application tables with CASCADE.
Preserves table structure and enum |
| `CachedChunk` | type | Single chunk with embedding vector and optional metadata. |

## Related Topics

- [`domain/core`](../domain/domain--core.en.md)
