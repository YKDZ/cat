import type { PluginServiceType } from "@cat/shared";

import type { QAChecker, Tokenizer } from "@/services";
import type { AgentContextProvider } from "@/services/agent-context-provider";
import type { AgentToolProvider } from "@/services/agent-tool-provider";
import type { AuthFactor } from "@/services/auth-factor";
import type { EmailProviderService } from "@/services/email-provider";
import type { FileExporter, FileImporter } from "@/services/file-handler";
import type { LLMProvider } from "@/services/llm-provider";
import type { NlpWordSegmenter } from "@/services/nlp-word-segmenter";
import type { RerankProvider } from "@/services/rerank-provider";
import type { StorageProvider } from "@/services/storage-provider";
import type { TextVectorizer } from "@/services/text-vectorizer";
import type { TranslationAdvisor } from "@/services/translation-advisor";
import type { VectorStorage } from "@/services/vector-storage";

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
