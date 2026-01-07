import type { Token } from "@/services/tokenizer.ts";
import z from "zod";
import type { IPluginService } from "./service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export const QASeverityValues = ["error", "warning", "info"] as const;

export type QASeverity = (typeof QASeverityValues)[number];

export interface QAIssue {
  severity: QASeverity;
  message: string;
  targetTokenIndex?: number;
}

export const QAIssueSchema = z.object({
  severity: z.enum(QASeverityValues),
  message: z.string(),
  targetTokenIndex: z.number().optional(),
});

/**
 * QA 上下文
 */
export interface CheckContext {
  source: {
    text: string;
    languageId: string;
    tokens: Token[];
    flatTokens: Token[];
  };
  translation: {
    text: string;
    languageId: string;
    tokens: Token[];
    flatTokens: Token[];
  };
  terms: {
    term: string;
    translation: string;
    subject: string | null;
  }[];
}

/**
 * QA 规则插件定义
 */
export abstract class QAChecker implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "QA_CHECKER";
  }

  abstract check: (ctx: CheckContext) => Promise<QAIssue[]> | QAIssue[];
}
