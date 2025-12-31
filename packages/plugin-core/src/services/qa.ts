import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type { Term } from "@cat/shared/schema/drizzle/glossary";

export type QAIssue = {
  type: "missing" | "incorrect" | "deprecated";
  sourceRange?: { start: number; end: number };
  targetRange?: { start: number; end: number };
  message?: string;
  suggestedTranslation?: string;
};

export type CheckContext = {
  source: {
    text: string;
    languageId: string;
    terms?: Term[];
  };
  target: {
    text: string;
    languageId: string;
    terms?: Term[];
  };
};

export abstract class QAChecker implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "QA_CHECKER";
  }
  /**
   * 检查译文是否违反某些规范
   */
  abstract check(ctx: CheckContext): Promise<QAIssue[]>;
}
