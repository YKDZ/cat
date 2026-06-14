/**
 * Default plugin IDs that are still distributed as filesystem plugins.
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
 * Builtin system plugin IDs.
 */
export const defaultSystemPluginIds = ["system-pgvector-storage"] as const;

/**
 * Default product plugin IDs.
 */
export const defaultProductPluginIds = [
  ...defaultFilesystemPluginIds,
  ...defaultSystemPluginIds,
] as const;
