import type { TranslationAdvisor } from "@/services/translation-advisor";
import type { TextVectorizer } from "@/services/text-vectorizer";
import type { StorageProvider } from "@/services/storage-provider";
import type { AuthProvider } from "@/services/auth-provider";
import type { VectorStorage } from "@/services/vector-storage";
import type {
  TermAligner,
  TermExtractor,
  TermRecognizer,
} from "@/services/term-services";
import type { MFAProvider } from "@/services/mfa-provider";
import type { FileExporter, FileImporter } from "@/services/file-handler";
import type { QAChecker, Tokenizer } from "@/services";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export type PluginServiceTypeMap = {
  AUTH_PROVIDER: AuthProvider;
  MFA_PROVIDER: MFAProvider;
  STORAGE_PROVIDER: StorageProvider;
  TEXT_VECTORIZER: TextVectorizer;
  FILE_IMPORTER: FileImporter;
  FILE_EXPORTER: FileExporter;
  TRANSLATION_ADVISOR: TranslationAdvisor;
  TERM_EXTRACTOR: TermExtractor;
  TERM_RECOGNIZER: TermRecognizer;
  TERM_ALIGNER: TermAligner;
  QA_CHECKER: QAChecker;
  TOKENIZER: Tokenizer;
  VECTOR_STORAGE: VectorStorage;
};

export type PluginServiceMap = {
  [K in PluginServiceType]: PluginServiceTypeMap[K];
};
