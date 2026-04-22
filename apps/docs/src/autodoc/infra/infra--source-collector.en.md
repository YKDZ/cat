# Source Collector

> **Section**: Infra  ·  **Subject ID**: `infra/source-collector`

**Primary package**: `@cat/source-collector`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `toCollectionPayload` | function | Assemble ExtractionResult + platform routing into CollectionPayload. |
| `collect` | function | Collect translatable elements from source files and return a CollectionPayload. |
| `extract` | function | Extract translatable elements from source files, returning ExtractionResult (no  |
| `extractFromScript` | function | Extract i18n calls from TypeScript/JavaScript source code. |
| `extractFromTemplate` | function | Extract i18n calls from a Vue template AST. |
| `ExtractOptions` | interface | Extraction options for a source extractor. |
| `SourceExtractor` | interface | Source extractor interface — pluggable i18n text extraction implementation. |
| `CollectOptions` | interface | Options for the collect() function. |
| `SourceExtractOptions` | interface | Options for the extract() function (pure extraction, no platform params). |
| `PayloadRoutingOptions` | interface | Platform routing parameters for toCollectionPayload(). |

## Related Topics

- [`domain/core`](../domain/domain--core.en.md)
