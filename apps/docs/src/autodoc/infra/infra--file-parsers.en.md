# File Parsers

> **Section**: Infra  ·  **Subject ID**: `infra/file-parsers`

**Primary package**: `@cat/file-parsers`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `encodeJsonPointerPart` | function | Escape a JSON Pointer path segment (RFC 6901). |
| `toJsonPointerRef` | function | Combine a namespace and a list of path parts into a stable JSON Pointer-style re |
| `ElementLocation` | interface | Optional source location information. |
| `ElementData` | interface | A parsed translatable element with stable identity references and local order. |
| `SerializeElement` | interface | Minimal element descriptor needed for serialization. |
| `FileParser` | type | File parser interface: parses file content into translatable elements and serial |
