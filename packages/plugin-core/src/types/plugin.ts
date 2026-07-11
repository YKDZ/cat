import type { PluginServiceType } from "@cat/shared";

import type { AgentContextProvider } from "#/services/agent-context-provider.ts";
import type { AgentToolProvider } from "#/services/agent-tool-provider.ts";
import type { AuthFactor } from "#/services/auth-factor.ts";
import type { EmailProviderService } from "#/services/email-provider.ts";
import type { FileExporter, FileImporter } from "#/services/file-handler.ts";
import type { QAChecker, Tokenizer } from "#/services/index.ts";
import type { LLMProvider } from "#/services/llm-provider.ts";
import type { NlpWordSegmenter } from "#/services/nlp-word-segmenter.ts";
import type { RerankProvider } from "#/services/rerank-provider.ts";
import type { StorageProvider } from "#/services/storage-provider.ts";
import type { TextVectorizer } from "#/services/text-vectorizer.ts";
import type { TranslationAdvisor } from "#/services/translation-advisor.ts";
import type { VectorStorage } from "#/services/vector-storage.ts";

export type PluginServiceTypeMap = {
  AUTH_FACTOR: AuthFactor;
  STORAGE_PROVIDER: StorageProvider;
  TEXT_VECTORIZER: TextVectorizer;
  FILE_IMPORTER: FileImporter;
  FILE_EXPORTER: FileExporter;
  TRANSLATION_ADVISOR: TranslationAdvisor;
  QA_CHECKER: QAChecker;
  TOKENIZER: Tokenizer;
  VECTOR_STORAGE: VectorStorage;
  LLM_PROVIDER: LLMProvider;
  RERANK_PROVIDER: RerankProvider;
  AGENT_TOOL_PROVIDER: AgentToolProvider;
  AGENT_CONTEXT_PROVIDER: AgentContextProvider;
  NLP_WORD_SEGMENTER: NlpWordSegmenter;
  EMAIL_PROVIDER: EmailProviderService;
};

export type PluginServiceMap = {
  [K in PluginServiceType]: PluginServiceTypeMap[K];
};
