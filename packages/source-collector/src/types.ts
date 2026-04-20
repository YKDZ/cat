import type { CollectionElement } from "@cat/shared/schema/collection";

/**
 * @zh 源码提取器的提取选项。
 * @en Extraction options for a source extractor.
 */
export interface ExtractOptions {
  /** @zh 文件内容字符串。 @en File content as string. */
  content: string;
  /** @zh 相对文件路径（用于 meta 和上下文生成）。 @en Relative file path (used in meta and context generation). */
  filePath: string;
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
  extract(options: ExtractOptions): CollectionElement[];
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
  /** @zh 文档名称。 @en Document name for the payload. */
  documentName: string;
}
