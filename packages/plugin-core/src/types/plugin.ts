import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

import type { QAChecker, Tokenizer } from "@/services";
import type { AuthProvider } from "@/services/auth-provider";
import type { FileExporter, FileImporter } from "@/services/file-handler";
import type { MFAProvider } from "@/services/mfa-provider";
import type { StorageProvider } from "@/services/storage-provider";
import type { TermAligner, TermExtractor } from "@/services/term-services";
import type { TextVectorizer } from "@/services/text-vectorizer";
import type { TranslationAdvisor } from "@/services/translation-advisor";
import type { VectorStorage } from "@/services/vector-storage";

export type PluginServiceTypeMap = {
  AUTH_PROVIDER: AuthProvider;
  MFA_PROVIDER: MFAProvider;
  STORAGE_PROVIDER: StorageProvider;
  TEXT_VECTORIZER: TextVectorizer;
  FILE_IMPORTER: FileImporter;
  FILE_EXPORTER: FileExporter;
  TRANSLATION_ADVISOR: TranslationAdvisor;
  TERM_EXTRACTOR: TermExtractor;
  TERM_ALIGNER: TermAligner;
  QA_CHECKER: QAChecker;
  TOKENIZER: Tokenizer;
  VECTOR_STORAGE: VectorStorage;
};

export type PluginServiceMap = {
  [K in PluginServiceType]: PluginServiceTypeMap[K];
};
