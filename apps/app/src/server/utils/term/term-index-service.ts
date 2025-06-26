export interface TermIndexService {
  ensureIndex(languageId: string): Promise<void>;
  analyzeText(languageId: string, text: string): Promise<string[]>;
}
