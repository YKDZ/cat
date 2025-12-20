import type { IPluginService } from "@/registry/plugin-registry";
import type { Term } from "@cat/shared/schema/drizzle/glossary";

export interface QAChecker extends IPluginService {
  /**
   * 检查译文是否违反某些规范
   */
  check(
    source: {
      text: string;
      languageId: string;
      terms?: Term[];
    },
    target: {
      text: string;
      languageId: string;
      terms?: Term[];
    },
  ): Promise<QAIssue[]>;
}

export type QAIssue = {
  type: "missing" | "incorrect" | "deprecated";
  sourceRange?: { start: number; end: number };
  targetRange?: { start: number; end: number };
  message?: string;
  suggestedTranslation?: string;
};
