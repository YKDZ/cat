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
  ruleId?: string;
  ruleFamily?: string;
  confidence?: number;
  sourceSpan?: { start: number; end: number; quote?: string };
  targetSpan?: { start: number; end: number; quote?: string };
  defaultAction?:
    | "BLOCK_APPROVAL"
    | "NEEDS_REVIEW"
    | "INFORMATIONAL"
    | "PASS"
    | "SUPPRESSED";
  suggestedText?: string;
  metadata?: Record<string, unknown>;
}

export const QAIssueSchema = z.object({
  severity: z.enum(QASeverityValues),
  message: z.string(),
  targetTokenIndex: z.int().optional(),
  ruleId: z.string().optional(),
  ruleFamily: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceSpan: z
    .object({
      start: z.int().min(0),
      end: z.int().min(0),
      quote: z.string().optional(),
    })
    .optional(),
  targetSpan: z
    .object({
      start: z.int().min(0),
      end: z.int().min(0),
      quote: z.string().optional(),
    })
    .optional(),
  defaultAction: z
    .enum([
      "BLOCK_APPROVAL",
      "NEEDS_REVIEW",
      "INFORMATIONAL",
      "PASS",
      "SUPPRESSED",
    ])
    .optional(),
  suggestedText: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
