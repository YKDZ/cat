/**
 * @zh 仍以文件系统插件形式分发的默认插件 ID。
 * @en Default plugin IDs that are still distributed as filesystem plugins.
 */
export const defaultFilesystemPluginIds = [
  "password-auth-provider",
  "json-file-handler",
  "yaml-file-handler",
  "markdown-file-handler",
  "local-storage-provider",
  "basic-tokenizer",
  "basic-qa-checker",
  "tiny-widget",
  "openai-vectorizer",
  "openai-llm-provider",
  "libretranslate-advisor",
  "spacy-segmenter",
  "tei-rerank-provider",
] as const;

/**
 * @zh 系统内置默认插件 ID。
 * @en Builtin system plugin IDs.
 */
export const defaultSystemPluginIds = ["system-pgvector-storage"] as const;

/**
 * @zh 默认产品插件 ID 列表。
 * @en Default product plugin IDs.
 */
export const defaultProductPluginIds = [
  ...defaultFilesystemPluginIds,
  ...defaultSystemPluginIds,
] as const;
