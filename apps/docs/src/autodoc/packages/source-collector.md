# @cat/source-collector

## Overview

* **Modules**: 6

* **Exported functions**: 5

* **Exported types**: 5

## Function Index

### packages/source-collector/src

### `toCollectionPayload`

```ts
/**
 * Assemble ExtractionResult + platform routing into CollectionPayload.
 */
export function toCollectionPayload(result: { elements: { ref: string; text: string; meta: any; sortIndex?: number | undefined; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: Record<string, unknown> | undefined; } | undefined; }[]; contexts: (({ type: "TEXT"; data: { text: string; }; } | { type: "JSON"; data: { json: any; }; } | { type: "FILE"; data: { fileId: number; }; } | { type: "MARKDOWN"; data: { markdown: string; }; } | { type: "URL"; data: { url: string; }; } | { type: "IMAGE"; data: { fileId: number; highlightRegion?: { x: number; y: number; width: number; height: number; } | undefined; }; }) & { elementRef: string; })[]; metadata?: { extractorIds: string[]; baseDir: string; timestamp: string; } | undefined; }, routing: PayloadRoutingOptions): { projectId: string; sourceLanguageId: string; document: { name: string; fileHandlerId?: string | undefined; }; elements: { ref: string; text: string; meta: any; sortIndex?: number | undefined; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: Record<string, unknown> | undefined; } | undefined; }[]; contexts: (({ type: "TEXT"; data: { text: string; }; } | { type: "JSON"; data: { json: any; }; } | { type: "FILE"; data: { fileId: number; }; } | { type: "MARKDOWN"; data: { markdown: string; }; } | { type: "URL"; data: { url: string; }; } | { type: "IMAGE"; data: { fileId: number; highlightRegion?: { x: number; y: number; width: number; height: number; } | undefined; }; }) & { elementRef: string; })[]; options?: { branchId?: number | undefined; } | undefined; }
```

### `collect`

```ts
/**
 * Collect translatable elements from source files and return a CollectionPayload.
 */
export async function collect(options: CollectOptions): Promise<{ projectId: string; sourceLanguageId: string; document: { name: string; fileHandlerId?: string | undefined; }; elements: { ref: string; text: string; meta: any; sortIndex?: number | undefined; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: Record<string, unknown> | undefined; } | undefined; }[]; contexts: (({ type: "TEXT"; data: { text: string; }; } | { type: "JSON"; data: { json: any; }; } | { type: "FILE"; data: { fileId: number; }; } | { type: "MARKDOWN"; data: { markdown: string; }; } | { type: "URL"; data: { url: string; }; } | { type: "IMAGE"; data: { fileId: number; highlightRegion?: { x: number; y: number; width: number; height: number; } | undefined; }; }) & { elementRef: string; })[]; options?: { branchId?: number | undefined; } | undefined; }>
```

### `extract`

```ts
/**
 * Extract translatable elements from source files, returning ExtractionResult (no platform params).
 */
export async function extract(options: SourceExtractOptions): Promise<{ elements: { ref: string; text: string; meta: any; sortIndex?: number | undefined; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: Record<string, unknown> | undefined; } | undefined; }[]; contexts: (({ type: "TEXT"; data: { text: string; }; } | { type: "JSON"; data: { json: any; }; } | { type: "FILE"; data: { fileId: number; }; } | { type: "MARKDOWN"; data: { markdown: string; }; } | { type: "URL"; data: { url: string; }; } | { type: "IMAGE"; data: { fileId: number; highlightRegion?: { x: number; y: number; width: number; height: number; } | undefined; }; }) & { elementRef: string; })[]; metadata?: { extractorIds: string[]; baseDir: string; timestamp: string; } | undefined; }>
```

### packages/source-collector/src/extractors

### `extractFromScript`

```ts
/**
 * Extract i18n calls from TypeScript/JavaScript source code.
 *
 * @param content - 脚本内容字符串
 * @param filePath - 相对文件路径
 * @param section - 脚本段标识（"script" | "scriptSetup" | "file"）
 * @param lineOffset - 脚本块在 SFC 中的起始行偏移（0-based）。
对于独立 TS 文件传 0。
 */
export function extractFromScript(content: string, filePath: string, section: "script" | "scriptSetup" | "file", lineOffset: number): { ref: string; text: string; meta: any; sortIndex?: number | undefined; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: Record<string, unknown> | undefined; } | undefined; }[]
```

### `extractFromTemplate`

```ts
/**
 * Extract i18n calls from a Vue template AST.
 *
 * @param ast - 模板 AST 根节点（来自
 * @param filePath - 相对文件路径，用于 meta.file
 * @param templateStartLine - 模板块在 SFC 中的起始行号（1-based）。
对于独立模板文件传 0。
 */
export function extractFromTemplate(ast: RootNode, filePath: string, templateStartLine: number): { ref: string; text: string; meta: any; sortIndex?: number | undefined; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: Record<string, unknown> | undefined; } | undefined; }[]
```

## Type Index

* `ExtractOptions` (interface) — Extraction options for a source extractor.

* `SourceExtractor` (interface) — Source extractor interface — pluggable i18n text extraction implementation.

* `CollectOptions` (interface) — Options for the collect() function.

* `SourceExtractOptions` (interface) — Options for the extract() function (pure extraction, no platform params).

* `PayloadRoutingOptions` (interface) — Platform routing parameters for toCollectionPayload().
