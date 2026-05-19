import type {
  BuiltinPluginEntry,
  CatPlugin,
  PluginLoader,
} from "@cat/plugin-core";

import basicQaChecker from "@cat-plugin/basic-qa-checker";
import basicTokenizer from "@cat-plugin/basic-tokenizer";
import jsonFileHandler from "@cat-plugin/json-file-handler";
import libreTranslateAdvisor from "@cat-plugin/libretranslate-advisor";
import localStorageProvider from "@cat-plugin/local-storage-provider";
import markdownFileHandler from "@cat-plugin/markdown-file-handler";
import openaiLlmProvider from "@cat-plugin/openai-llm-provider";
import openaiVectorizer from "@cat-plugin/openai-vectorizer";
import passwordAuthProvider from "@cat-plugin/password-auth-provider";
import spacySegmenter from "@cat-plugin/spacy-segmenter";
import teiRerankProvider from "@cat-plugin/tei-rerank-provider";
import tinyWidget from "@cat-plugin/tiny-widget";
import yamlFileHandler from "@cat-plugin/yaml-file-handler";
import {
  BuiltinPluginLoader,
  CompositePluginLoader,
  FileSystemPluginLoader,
} from "@cat/plugin-core";
import {
  defaultProductPluginIds,
  systemPgVectorEntry,
} from "@cat/server-shared";
import { PluginManifestSchema } from "@cat/shared";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import basicQaCheckerManifest from "../../../../../@cat-plugin/basic-qa-checker/manifest.json";
import basicQaCheckerPackage from "../../../../../@cat-plugin/basic-qa-checker/package.json";
import basicTokenizerManifest from "../../../../../@cat-plugin/basic-tokenizer/manifest.json";
import basicTokenizerPackage from "../../../../../@cat-plugin/basic-tokenizer/package.json";
import jsonFileHandlerManifest from "../../../../../@cat-plugin/json-file-handler/manifest.json";
import jsonFileHandlerPackage from "../../../../../@cat-plugin/json-file-handler/package.json";
import libreTranslateAdvisorManifest from "../../../../../@cat-plugin/libretranslate-advisor/manifest.json";
import libreTranslateAdvisorPackage from "../../../../../@cat-plugin/libretranslate-advisor/package.json";
import localStorageProviderManifest from "../../../../../@cat-plugin/local-storage-provider/manifest.json";
import localStorageProviderPackage from "../../../../../@cat-plugin/local-storage-provider/package.json";
import markdownFileHandlerManifest from "../../../../../@cat-plugin/markdown-file-handler/manifest.json";
import markdownFileHandlerPackage from "../../../../../@cat-plugin/markdown-file-handler/package.json";
import openaiLlmProviderManifest from "../../../../../@cat-plugin/openai-llm-provider/manifest.json";
import openaiLlmProviderPackage from "../../../../../@cat-plugin/openai-llm-provider/package.json";
import openaiVectorizerManifest from "../../../../../@cat-plugin/openai-vectorizer/manifest.json";
import openaiVectorizerPackage from "../../../../../@cat-plugin/openai-vectorizer/package.json";
import passwordAuthProviderManifest from "../../../../../@cat-plugin/password-auth-provider/manifest.json";
import passwordAuthProviderPackage from "../../../../../@cat-plugin/password-auth-provider/package.json";
import spacySegmenterManifest from "../../../../../@cat-plugin/spacy-segmenter/manifest.json";
import spacySegmenterPackage from "../../../../../@cat-plugin/spacy-segmenter/package.json";
import teiRerankProviderManifest from "../../../../../@cat-plugin/tei-rerank-provider/manifest.json";
import teiRerankProviderPackage from "../../../../../@cat-plugin/tei-rerank-provider/package.json";
import tinyWidgetManifest from "../../../../../@cat-plugin/tiny-widget/manifest.json";
import tinyWidgetPackage from "../../../../../@cat-plugin/tiny-widget/package.json";
import yamlFileHandlerManifest from "../../../../../@cat-plugin/yaml-file-handler/manifest.json";
import yamlFileHandlerPackage from "../../../../../@cat-plugin/yaml-file-handler/package.json";

const packageRootFromEntry = (entryUrl: string): string => {
  return dirname(dirname(fileURLToPath(entryUrl)));
};

const parseManifest = (manifest: unknown): BuiltinPluginEntry["manifest"] => {
  return PluginManifestSchema.parse(manifest);
};

const tinyWidgetAssetRoot = packageRootFromEntry(
  import.meta.resolve("@cat-plugin/tiny-widget"),
);

const toEntry = (
  manifest: BuiltinPluginEntry["manifest"],
  pkg: { description?: string; name: string; version: string },
  plugin: CatPlugin,
  assetRoot?: string,
): BuiltinPluginEntry => ({
  manifest,
  data: {
    id: manifest.id,
    name: pkg.name,
    version: manifest.version ?? pkg.version,
    overview: pkg.description ?? manifest.id,
    entry: manifest.entry,
    config: manifest.config,
  },
  load: () => plugin,
  assetRoot,
});

/**
 * @zh 以 builtin 方式分发的默认文件系统插件条目。
 * @en Default filesystem plugin entries distributed as builtins.
 */
export const builtinFilesystemPluginEntries: BuiltinPluginEntry[] = [
  toEntry(
    parseManifest(passwordAuthProviderManifest),
    passwordAuthProviderPackage,
    passwordAuthProvider,
  ),
  toEntry(
    parseManifest(jsonFileHandlerManifest),
    jsonFileHandlerPackage,
    jsonFileHandler,
  ),
  toEntry(
    parseManifest(yamlFileHandlerManifest),
    yamlFileHandlerPackage,
    yamlFileHandler,
  ),
  toEntry(
    parseManifest(markdownFileHandlerManifest),
    markdownFileHandlerPackage,
    markdownFileHandler,
  ),
  toEntry(
    parseManifest(localStorageProviderManifest),
    localStorageProviderPackage,
    localStorageProvider,
  ),
  toEntry(
    parseManifest(basicTokenizerManifest),
    basicTokenizerPackage,
    basicTokenizer,
  ),
  toEntry(
    parseManifest(basicQaCheckerManifest),
    basicQaCheckerPackage,
    basicQaChecker,
  ),
  toEntry(
    parseManifest(tinyWidgetManifest),
    tinyWidgetPackage,
    tinyWidget,
    tinyWidgetAssetRoot,
  ),
  toEntry(
    parseManifest(openaiVectorizerManifest),
    openaiVectorizerPackage,
    openaiVectorizer,
  ),
  toEntry(
    parseManifest(openaiLlmProviderManifest),
    openaiLlmProviderPackage,
    openaiLlmProvider,
  ),
  toEntry(
    parseManifest(libreTranslateAdvisorManifest),
    libreTranslateAdvisorPackage,
    libreTranslateAdvisor,
  ),
  toEntry(
    parseManifest(spacySegmenterManifest),
    spacySegmenterPackage,
    spacySegmenter,
  ),
  toEntry(
    parseManifest(teiRerankProviderManifest),
    teiRerankProviderPackage,
    teiRerankProvider,
  ),
];

/**
 * @zh 当前 app 默认安装的 builtin 插件条目。
 * @en Builtin plugin entries installed by default in the app.
 */
export const builtinDefaultPluginEntries: BuiltinPluginEntry[] = [
  ...builtinFilesystemPluginEntries,
  systemPgVectorEntry,
];

/**
 * @zh 当前 app 默认安装的插件 ID 列表。
 * @en Plugin IDs installed by default in the app.
 */
export const defaultPluginIds = [...defaultProductPluginIds];

/**
 * @zh 返回默认插件 ID 列表的副本。
 * @en Return a copy of the default plugin IDs.
 */
export const getDefaultPluginIds = (): string[] => [...defaultPluginIds];

/**
 * @zh 创建 app 使用的组合 plugin loader（builtin + filesystem）。
 * @en Create the app plugin loader that combines builtin and filesystem plugins.
 */
export const createAppPluginLoader = (): PluginLoader => {
  return new CompositePluginLoader([
    new BuiltinPluginLoader(builtinDefaultPluginEntries),
    new FileSystemPluginLoader(resolve(process.cwd(), "plugins")),
  ]);
};
