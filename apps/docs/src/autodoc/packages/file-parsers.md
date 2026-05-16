# @cat/file-parsers

## Overview

* **Modules**: 2

* **Exported functions**: 2

* **Exported types**: 4

## Function Index

### packages/file-parsers/src

### `encodeJsonPointerPart`

```ts
/**
 * Escape a JSON Pointer path segment (RFC 6901).
 */
export const encodeJsonPointerPart = (part: string | number): string
```

### `toJsonPointerRef`

```ts
/**
 * Combine a namespace and a list of path parts into a stable JSON Pointer-style reference.
 */
export const toJsonPointerRef = (namespace: "json" | "yaml" | "markdown" | "source", parts: readonly (string | number)[]): string
```

## Type Index

* `ElementLocation` (interface) — Optional source location information.

* `ElementData` (interface) — A parsed translatable element with stable identity references and local order.

* `SerializeElement` (interface) — Minimal element descriptor needed for serialization.

* `FileParser` (type) — File parser interface: parses file content into translatable elements and serializes translated elements back to file content.
