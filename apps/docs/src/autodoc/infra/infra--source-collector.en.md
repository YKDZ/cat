# Source Collector

> **Section**: Infra  ·  **Subject ID**: `infra/source-collector`

**Primary package**: `@cat/source-collector`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `toCollectionPayload` | function | Assemble SourceExtractionGraphResult + platform routing into StructuredContentPa |
| `collect` | function | Collect translatable elements from source files and return a StructuredContentPa |
| `extract` | function | Extract translatable elements from source files, returning graph-structured resu |
| `extractFromScript` | function | Extract i18n calls from TypeScript/JavaScript source code. |
| `normalizeI18nText` | function | Normalize i18n text for stable references and locale matching. |
| `buildTextFingerprint` | function | Build a source text fingerprint for diagnostics and meta only, not stable identi |
| `buildStableSourceRef` | function | Build a stable element reference that does not depend on source line numbers. |
| `StableSourceRefInput` | type | Input required to build a stable source reference. |
| `extractFromTemplate` | function | Extract i18n calls from a Vue template AST. |
| `SourceCollectionDiagnostic` | interface | Diagnostic emitted during source collection. |
| `ExtractOptions` | interface | Extraction options for a source extractor. |
| `SourceExtractor` | interface | Source extractor interface — pluggable i18n text extraction implementation. |
| `CollectOptions` | interface | Options for the collect() function. |
| `SourceExtractOptions` | interface | Options for the extract() function (pure extraction, no platform params). |
| `PayloadRoutingOptions` | interface | Platform routing parameters for toCollectionPayload(). |
| `SourceExtractionGraphResult` | interface | Graph-structured result from source extraction (with nodes, relations, evidence) |

## Related Topics

- [`domain/core`](../domain/domain--core.en.md)
