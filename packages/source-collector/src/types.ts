import type {
  StructuredContentNodeInput,
  StructuredEvidenceInput,
  StructuredRelationInput,
  StructuredTranslatableElementInput,
} from "@cat/shared";

/**
 * @zh 源码采集诊断项。
 * @en Diagnostic emitted during source collection.
 */
export interface SourceCollectionDiagnostic {
  /** @zh 严重程度。 @en Diagnostic severity. */
  severity: "warning" | "error";
  /** @zh 机器可读代码。 @en Machine-readable diagnostic code. */
  code:
    | "READ_FAILED"
    | "EXTRACT_FAILED"
    | "NO_EXTRACTOR"
    | "LANGUAGE_MISMATCH"
    | "DUPLICATE_STABLE_IDENTITY";
  /** @zh 可选相对文件路径。 @en Optional relative file path. */
  filePath?: string;
  /** @zh 人类可读消息。 @en Human-readable message. */
  message: string;
  /** @zh 结构化细节。 @en Structured details. */
  details?: Record<string, unknown>;
}

/**
 * @zh 源码提取器的提取选项。
 * @en Extraction options for a source extractor.
 */
export interface ExtractOptions {
  /** @zh 文件内容字符串。 @en File content as string. */
  content: string;
  /** @zh 相对文件路径（用于 meta 和上下文生成）。 @en Relative file path (used in meta and context generation). */
  filePath: string;
  /** @zh 源语言 ID。 @en Source language ID. */
  sourceLanguageId?: string;
}

/**
 * @zh 源码提取器接口——可插拔的 i18n 文本提取实现。
 * @en Source extractor interface — pluggable i18n text extraction implementation.
 */
export interface SourceExtractor {
  /** @zh 提取器唯一标识符，如 "vue-i18n"、"react-intl"。 @en Unique extractor ID, e.g. "vue-i18n", "react-intl". */
  id: string;
  /** @zh 支持的文件扩展名列表，如 [".vue", ".ts"]。 @en Supported file extensions, e.g. [".vue", ".ts"]. */
  supportedExtensions: string[];
  /**
   * @zh 从单个文件中提取可翻译元素。
   * @en Extract translatable elements from a single file.
   */
  extract(options: ExtractOptions): StructuredTranslatableElementInput[];
}

/**
 * @zh collect() 函数的选项。
 * @en Options for the collect() function.
 */
export interface CollectOptions {
  /** @zh 用于文件发现的 glob 模式列表。 @en Glob patterns for file discovery. */
  globs: string[];
  /** @zh 使用的提取器列表。 @en Extractors to use. */
  extractors: SourceExtractor[];
  /** @zh glob 展开的基目录。 @en Base directory for glob expansion. */
  baseDir: string;
  /** @zh 目标项目 ID。 @en Target project ID. */
  projectId: string;
  /** @zh 源语言 ID。 @en Source language ID. */
  sourceLanguageId: string;
  /** @zh 源根引用（作为 sourceRootRef）。 @en Source root reference (used as sourceRootRef). */
  sourceRootRef: string;
  /** @zh 根节点展示标签。 @en Display label for the root node. */
  rootDisplayLabel?: string;
}

/**
 * @zh extract() 函数的选项（纯提取，不含平台参数）。
 * @en Options for the extract() function (pure extraction, no platform params).
 */
export interface SourceExtractOptions {
  /** @zh 用于文件发现的 glob 模式列表。 @en Glob patterns for file discovery. */
  globs: string[];
  /** @zh 使用的提取器列表。 @en Extractors to use. */
  extractors: SourceExtractor[];
  /** @zh glob 展开的基目录。 @en Base directory for glob expansion. */
  baseDir: string;
  /** @zh 源语言 ID；默认保持向后兼容为 "en"。 @en Source language ID; defaults to "en" for backward compatibility. */
  sourceLanguageId?: string;
}

/**
 * @zh toCollectionPayload() 的平台路由参数。
 * @en Platform routing parameters for toCollectionPayload().
 */
export interface PayloadRoutingOptions {
  /** @zh 目标项目 ID（UUIDv4）。 @en Target project ID (UUIDv4). */
  projectId: string;
  /** @zh 源语言 ID。 @en Source language ID. */
  sourceLanguageId: string;
  /** @zh 源根引用（importer scoped path, e.g. baseDir）。 @en Source root reference (importer-scoped path). */
  sourceRootRef: string;
  /** @zh 根节点展示标签。 @en Display label for the root node. */
  rootDisplayLabel?: string;
  /** @zh 可选参数。 @en Optional parameters. */
  options?: {
    branchId?: number;
  };
}

/**
 * @zh 源码提取的图结构结果（带节点、关系、证据）。
 * @en Graph-structured result from source extraction (with nodes, relations, evidence).
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
