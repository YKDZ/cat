import type { PluginServiceType } from "@cat/shared";

import z from "zod";

import type { Token } from "@/services/tokenizer.ts";

import type { IPluginService } from "./service";

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
  targetTokenIndex: z.int().optional(),
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
    definition: string | null;
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
