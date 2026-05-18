# @cat/source-collector

## Overview

* **Modules**: 7

* **Exported functions**: 8

* **Exported types**: 8

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
 *
 * @param options - Collection options
 *
 * @returns Structured content payload
 */
export async function collect(options: CollectOptions): Promise<{ payloadVersion: "content-graph/v1"; projectId: string; sourceLanguageId: string; importerId: string; sourceRootRef: string; relationTypes: { namespace: string; name: string; version: string; semanticFamily: "CUSTOM" | "CONTAINMENT" | "ORDERING" | "SOURCE_REFERENCE" | "SCOPE" | "DEPENDENCY" | "VERSIONING" | "EVIDENCE" | "DISCUSSION" | "DUPLICATE" | "SEMANTIC"; allowedEndpointPairs: { source: "ELEMENT" | "NODE"; target: "ELEMENT" | "NODE"; }[]; directionality: "DIRECTED" | "UNDIRECTED"; participatesInContainment: boolean; participatesInExport: boolean; supportsOrdering: boolean; weightingEligible: boolean; defaultTrustLevel: "UNTRUSTED" | "COLLECTED" | "VERIFIED" | "REVIEW_APPROVED"; ownerPluginId?: string | null | undefined; deprecation?: any; migration?: any; metadata?: any; }[]; nodes: { ref: string; kind: "CUSTOM" | "FILE" | "PROJECT_ROOT" | "DIRECTORY" | "MARKDOWN_SECTION" | "SOURCE_COMPONENT" | "UI_ROUTE" | "MODULE" | "MOD" | "VERSION" | "NAMESPACE" | "CHAPTER" | "PACKAGE" | "SCREENSHOT_TARGET"; displayLabel: string; importerId: string; sourceRootRef: string; stableSourceNodeRef: string; exportRole: "FILE" | "PROJECT_ROOT" | "DIRECTORY" | "NONE" | "SECTION"; boundaryType: "FILE" | "DIRECTORY" | "MODULE" | "MOD" | "NAMESPACE" | "NONE" | "PROJECT" | "SOURCE_ROOT"; parentRef?: string | null | undefined; sourceUri?: string | null | undefined; sourcePath?: string | null | undefined; sourceType?: string | null | undefined; languageId?: string | null | undefined; file?: { fileId: number; fileHandlerId?: number | null | undefined; } | null | undefined; metadata?: any; provenance?: any; }[]; elements: { ref: string; stableSourceRef: string; sourceNodeRef: string; text: string; languageId: string; localOrder?: number | undefined; meta?: any; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: any; } | undefined; }[]; relations: { type: { namespace: string; name: string; version: string; }; source: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; }; target: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; }; isPrimary: boolean; confidenceBasisPoints: number; localOrder?: number | null | undefined; provenance?: any; metadata?: any; }[]; evidence: { attachedTo: { kind: "NODE"; nodeRef: string; } | { kind: "ELEMENT"; elementRef: string; } | { kind: "RELATION"; relationRef: string; }; kind: "COMMENT" | "TEXT" | "JSON" | "FILE" | "MARKDOWN" | "URL" | "IMAGE" | "SOURCE_LOCATION" | "SCREENSHOT" | "GENERATED_ANALYSIS" | "EXTERNAL_REFERENCE"; trustLevel: "UNTRUSTED" | "COLLECTED" | "VERIFIED" | "REVIEW_APPROVED"; ref?: string | undefined; textData?: string | null | undefined; jsonData?: any; fileId?: number | null | undefined; storageProviderId?: number | null | undefined; displayLabel?: string | null | undefined; freshness?: string | null | undefined; provenance?: any; }[]; options?: { branchId?: number | undefined; } | undefined; }>
```

### `extract`

```ts
/**
 * Extract translatable elements from source files, returning graph-structured result (no platform params).
 *
 * @param options - Pure extraction options
 *
 * @returns Graph-structured extraction result
 */
export async function extract(options: SourceExtractOptions): Promise<SourceExtractionGraphResult>
```

### packages/source-collector/src/extractors

### `extractFromScript`

```ts
/**
 * Extract i18n calls from TypeScript/JavaScript source code.
 *
 * @param content - Script content
 * @param filePath - Relative file path
 * @param section - Script section identifier
 * @param lineOffset - Starting line offset inside the SFC block (0-based)
 * @param options - Extraction options
 *
 * @returns Extracted translatable elements
 */
export function extractFromScript(content: string, filePath: string, section: "file" | "script" | "scriptSetup", lineOffset: number, options?: ScriptExtractionOptions): { ref: string; stableSourceRef: string; sourceNodeRef: string; text: string; languageId: string; localOrder?: number | undefined; meta?: any; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: any; } | undefined; }[]
```

### `normalizeI18nText`

```ts
/**
 * Normalize i18n text for stable references and locale matching.
 *
 * @param text - Raw text
 *
 * @returns Normalized text
 */
export const normalizeI18nText = (text: string): string
```

### `buildTextFingerprint`

```ts
/**
 * Build a source text fingerprint for diagnostics and meta only, not stable identity.
 *
 * @param text - Raw text
 *
 * @returns Short text fingerprint
 */
export const buildTextFingerprint = (text: string): string
```

### `buildStableSourceRef`

```ts
/**
 * Build a stable element reference that does not depend on source line numbers.
 *
 * @param input - Stable reference input
 *
 * @returns Stable source reference
 */
export const buildStableSourceRef = (input: StableSourceRefInput): string
```

### `extractFromTemplate`

```ts
/**
 * Extract i18n calls from a Vue template AST.
 *
 * @param ast - Template AST root node
 * @param filePath - Relative file path used in meta.file
 * @param templateStartLine - Starting line offset of the template block inside the SFC (1-based)
 * @param options - Extraction options
 *
 * @returns Extracted translatable elements
 */
export function extractFromTemplate(ast: RootNode, filePath: string, templateStartLine: number, options?: TemplateExtractionOptions): { ref: string; stableSourceRef: string; sourceNodeRef: string; text: string; languageId: string; localOrder?: number | undefined; meta?: any; location?: { startLine?: number | undefined; endLine?: number | undefined; custom?: any; } | undefined; }[]
```

## Type Index

* `StableSourceRefInput` (type) — Input required to build a stable source reference.

* `SourceCollectionDiagnostic` (interface) — Diagnostic emitted during source collection.

* `ExtractOptions` (interface) — Extraction options for a source extractor.

* `SourceExtractor` (interface) — Source extractor interface — pluggable i18n text extraction implementation.

* `CollectOptions` (interface) — Options for the collect() function.

* `SourceExtractOptions` (interface) — Options for the extract() function (pure extraction, no platform params).

* `PayloadRoutingOptions` (interface) — Platform routing parameters for toCollectionPayload().

* `SourceExtractionGraphResult` (interface) — Graph-structured result from source extraction (with nodes, relations, evidence).
