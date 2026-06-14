import type {
  StructuredContentNodeInput,
  StructuredEvidenceInput,
  StructuredRelationInput,
  StructuredTranslatableElementInput,
} from "@cat/shared";

/**
 * Diagnostic emitted during source collection.
 */
export interface SourceCollectionDiagnostic {
  /** Diagnostic severity. */
  severity: "warning" | "error";
  /** Machine-readable diagnostic code. */
  code:
    | "READ_FAILED"
    | "EXTRACT_FAILED"
    | "NO_EXTRACTOR"
    | "LANGUAGE_MISMATCH"
    | "DUPLICATE_STABLE_IDENTITY";
  /** Optional relative file path. */
  filePath?: string;
  /** Human-readable message. */
  message: string;
  /** Structured details. */
  details?: Record<string, unknown>;
}

/**
 * Extraction options for a source extractor.
 */
export interface ExtractOptions {
  /** File content as string. */
  content: string;
  /** Relative file path (used in meta and context generation). */
  filePath: string;
  /** Source language ID. */
  sourceLanguageId?: string;
}

/**
 * Source extractor interface — pluggable i18n text extraction implementation.
 */
export interface SourceExtractor {
  /** Unique extractor ID, e.g. "vue-i18n", "react-intl". */
  id: string;
  /** Supported file extensions, e.g. [".vue", ".ts"]. */
  supportedExtensions: string[];
  /**
   * Extract translatable elements from a single file.
   */
  extract(options: ExtractOptions): StructuredTranslatableElementInput[];
}

/**
 * Options for the collect() function.
 */
export interface CollectOptions {
  /** Glob patterns for file discovery. */
  globs: string[];
  /** Extractors to use. */
  extractors: SourceExtractor[];
  /** Base directory for glob expansion. */
  baseDir: string;
  /** Target project ID. */
  projectId: string;
  /** Source language ID. */
  sourceLanguageId: string;
  /** Source root reference (used as sourceRootRef). */
  sourceRootRef: string;
  /** Display label for the root node. */
  rootDisplayLabel?: string;
}

/**
 * Options for the extract() function (pure extraction, no platform params).
 */
export interface SourceExtractOptions {
  /** Glob patterns for file discovery. */
  globs: string[];
  /** Extractors to use. */
  extractors: SourceExtractor[];
  /** Base directory for glob expansion. */
  baseDir: string;
  /** Source language ID; defaults to "en" for backward compatibility. */
  sourceLanguageId?: string;
}

/**
 * Platform routing parameters for toCollectionPayload().
 */
export interface PayloadRoutingOptions {
  /** Target project ID (UUIDv4). */
  projectId: string;
  /** Source language ID. */
  sourceLanguageId: string;
  /** Source root reference (importer-scoped path). */
  sourceRootRef: string;
  /** Display label for the root node. */
  rootDisplayLabel?: string;
  /** Optional parameters. */
  options?: {
    branchId?: number;
  };
}

/**
 * Graph-structured result from source extraction (with nodes, relations, evidence).
 */
export interface SourceExtractionGraphResult {
  importerId: string;
  relationTypes: Array<{ namespace: string; name: string; version: string }>;
  nodes: StructuredContentNodeInput[];
  elements: StructuredTranslatableElementInput[];
  relations: StructuredRelationInput[];
  evidence: StructuredEvidenceInput[];
  diagnostics: SourceCollectionDiagnostic[];
}
