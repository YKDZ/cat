# @cat/source-collector

## Overview

* **Modules**: 6

* **Exported functions**: 5

* **Exported types**: 6

## Function Index

### packages/source-collector/src

### `toCollectionPayload`

```ts
/**
 * Assemble SourceExtractionGraphResult + platform routing into StructuredContentPayload.
 */
export function toCollectionPayload(result: SourceExtractionGraphResult, routing: PayloadRoutingOptions): { payloadVersion: "content-graph/v1"; projectId: string; sourceLanguageId: string; importerId: string; sourceRootRef: string; relationTypes: { namespace: string; name: string; version: string; semanticFamily: "CUSTOM" | "CONTAINMENT" | "ORDERING" | "SOURCE_REFERENCE" | "SCOPE" | "DEPENDENCY" | "VERSIONING" | "EVIDENCE" | "DISCUSSION" | "DUPLICATE" | "SEMANTIC"; allowedEndpointPairs: { source: "ELEMENT" | "NODE"; target: "ELEMENT" | "NODE"; }[]; directionality: "DIRECTED" | "UNDIRECTED"; participatesInContainment: boolean; participatesInExport: boolean; supportsOrdering: boolean; weightingEligible: boolean; defaultTrustLevel: "UNTRUSTED" | "COLLECTED" | "VERIFIED" | "REVIEW_APPROVED"; ownerPluginId?: string | null | undefined; deprecation?: any; migration?: any; metadata?: any; }[]; nodes: { ref: string; kind: "CUSTOM" | "FILE" | "PROJECT_ROOT" | "DIRECTORY" | "MARKDOWN_SECTION" | "SOURCE_COMPONENT" | "UI_ROUTE" | "MODULE" | "MOD" | "VERSION" | "NAMESPACE" | "CHAPTER" | "PACKAGE" | "SCREENSHOT_TARGET"; displayLabel: string; importerId: string; sourceRootRef: string; stableSourceNodeRef: string; exportRole: "FILE" | "PROJECT_ROOT" | "DIRECTORY" | "NONE" | "SECTION"; boundaryType: "FILE" | "DIRECTORY" | "MODULE" | "MOD" | "NAMESPACE" | "NONE" | "PROJECT" | "SOURCE_ROOT"; parentRef?: string | null | undefined; sourceUri?: string | null | undefined; sourcePath?: string | null | undefined; sourceType?: string | null | undefined; languageId?: string | null | undefined; file?: { fileId: number; fileHandlerId?: number | null | undefined; } | null | undefined; metadata?: any; provenance?: any; }[]; elements: { ref: string; stableSourceRef: string; sourceNodeRef: string; text: string; languageId: string; localOrder?: number | undefined; meta?: any; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: any; } | undefined; }[]; relations: { type: { namespace: string; name: string; version: string; }; source: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; }; target: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; }; isPrimary: boolean; confidenceBasisPoints: number; localOrder?: number | null | undefined; provenance?: any; metadata?: any; }[]; evidence: { attachedTo: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; } | { kind: "RELATION"; relationRef: string; }; kind: "COMMENT" | "TEXT" | "JSON" | "FILE" | "MARKDOWN" | "URL" | "IMAGE" | "SOURCE_LOCATION" | "SCREENSHOT" | "GENERATED_ANALYSIS" | "EXTERNAL_REFERENCE"; trustLevel: "UNTRUSTED" | "COLLECTED" | "VERIFIED" | "REVIEW_APPROVED"; ref?: string | undefined; textData?: string | null | undefined; jsonData?: any; fileId?: number | null | undefined; storageProviderId?: number | null | undefined; displayLabel?: string | null | undefined; freshness?: string | null | undefined; provenance?: any; }[]; options?: { branchId?: number | undefined; } | undefined; }
```

### `collect`

```ts
/**
 * Collect translatable elements from source files and return a StructuredContentPayload.
 */
export async function collect(options: CollectOptions): Promise<{ payloadVersion: "content-graph/v1"; projectId: string; sourceLanguageId: string; importerId: string; sourceRootRef: string; relationTypes: { namespace: string; name: string; version: string; semanticFamily: "CUSTOM" | "CONTAINMENT" | "ORDERING" | "SOURCE_REFERENCE" | "SCOPE" | "DEPENDENCY" | "VERSIONING" | "EVIDENCE" | "DISCUSSION" | "DUPLICATE" | "SEMANTIC"; allowedEndpointPairs: { source: "ELEMENT" | "NODE"; target: "ELEMENT" | "NODE"; }[]; directionality: "DIRECTED" | "UNDIRECTED"; participatesInContainment: boolean; participatesInExport: boolean; supportsOrdering: boolean; weightingEligible: boolean; defaultTrustLevel: "UNTRUSTED" | "COLLECTED" | "VERIFIED" | "REVIEW_APPROVED"; ownerPluginId?: string | null | undefined; deprecation?: any; migration?: any; metadata?: any; }[]; nodes: { ref: string; kind: "CUSTOM" | "FILE" | "PROJECT_ROOT" | "DIRECTORY" | "MARKDOWN_SECTION" | "SOURCE_COMPONENT" | "UI_ROUTE" | "MODULE" | "MOD" | "VERSION" | "NAMESPACE" | "CHAPTER" | "PACKAGE" | "SCREENSHOT_TARGET"; displayLabel: string; importerId: string; sourceRootRef: string; stableSourceNodeRef: string; exportRole: "FILE" | "PROJECT_ROOT" | "DIRECTORY" | "NONE" | "SECTION"; boundaryType: "FILE" | "DIRECTORY" | "MODULE" | "MOD" | "NAMESPACE" | "NONE" | "PROJECT" | "SOURCE_ROOT"; parentRef?: string | null | undefined; sourceUri?: string | null | undefined; sourcePath?: string | null | undefined; sourceType?: string | null | undefined; languageId?: string | null | undefined; file?: { fileId: number; fileHandlerId?: number | null | undefined; } | null | undefined; metadata?: any; provenance?: any; }[]; elements: { ref: string; stableSourceRef: string; sourceNodeRef: string; text: string; languageId: string; localOrder?: number | undefined; meta?: any; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: any; } | undefined; }[]; relations: { type: { namespace: string; name: string; version: string; }; source: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; }; target: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; }; isPrimary: boolean; confidenceBasisPoints: number; localOrder?: number | null | undefined; provenance?: any; metadata?: any; }[]; evidence: { attachedTo: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; } | { kind: "RELATION"; relationRef: string; }; kind: "COMMENT" | "TEXT" | "JSON" | "FILE" | "MARKDOWN" | "URL" | "IMAGE" | "SOURCE_LOCATION" | "SCREENSHOT" | "GENERATED_ANALYSIS" | "EXTERNAL_REFERENCE"; trustLevel: "UNTRUSTED" | "COLLECTED" | "VERIFIED" | "REVIEW_APPROVED"; ref?: string | undefined; textData?: string | null | undefined; jsonData?: any; fileId?: number | null | undefined; storageProviderId?: number | null | undefined; displayLabel?: string | null | undefined; freshness?: string | null | undefined; provenance?: any; }[]; options?: { branchId?: number | undefined; } | undefined; }>
```

### `extract`

```ts
/**
 * Extract translatable elements from source files, returning graph-structured result (no platform params).
 */
export async function extract(options: SourceExtractOptions): Promise<SourceExtractionGraphResult>
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
export function extractFromScript(content: string, filePath: string, section: "file" | "script" | "scriptSetup", lineOffset: number): { ref: string; stableSourceRef: string; sourceNodeRef: string; text: string; languageId: string; localOrder?: number | undefined; meta?: any; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: any; } | undefined; }[]
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
export function extractFromTemplate(ast: RootNode, filePath: string, templateStartLine: number): { ref: string; stableSourceRef: string; sourceNodeRef: string; text: string; languageId: string; localOrder?: number | undefined; meta?: any; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: any; } | undefined; }[]
```

## Type Index

* `ExtractOptions` (interface) — Extraction options for a source extractor.

* `SourceExtractor` (interface) — Source extractor interface — pluggable i18n text extraction implementation.

* `CollectOptions` (interface) — Options for the collect() function.

* `SourceExtractOptions` (interface) — Options for the extract() function (pure extraction, no platform params).

* `PayloadRoutingOptions` (interface) — Platform routing parameters for toCollectionPayload().

* `SourceExtractionGraphResult` (interface) — Graph-structured result from source extraction (with nodes, relations, evidence).
