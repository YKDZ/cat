/**
 * Default plugin IDs that are still distributed as filesystem plugins.
 */
export const defaultFilesystemPluginIds = [
  "password-auth-provider",
  "json-file-handler",
  "yaml-file-handler",
  "markdown-file-handler",
  "basic-tokenizer",
  "basic-qa-checker",
  "tiny-widget",
  "openai-vectorizer",
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
