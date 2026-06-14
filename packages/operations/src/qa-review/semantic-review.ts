import type { PluginManager } from "@cat/plugin-core";

import { collectLLMResponse, firstOrGivenService } from "@cat/server-shared";
import {
  QaReviewSpanSchema,
  type NormalizedQaFinding,
  type QaReviewProfileConfig,
} from "@cat/shared";
import * as z from "zod";

const SemanticQaFindingSchema = z.object({
  ruleId: z.string(),
  ruleFamily: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  confidenceBasisPoints: z.int().min(0).max(10000),
  riskScore: z.int().min(0).max(100),
  message: z.string(),
  explanation: z.string().nullable().optional(),
  targetSpan: QaReviewSpanSchema.nullable().optional(),
  suggestedText: z.string().nullable().optional(),
});

const SemanticQaReviewResponseSchema = z.object({
  summary: z.string().nullable().optional(),
  findings: z.array(SemanticQaFindingSchema).default([]),
});

const SEMANTIC_REVIEW_SYSTEM_PROMPT = `You are a translation QA reviewer.
Return valid JSON only using this schema:
{
  "summary": string | null,
  "findings": [
    {
      "ruleId": string,
      "ruleFamily": string,
      "severity": "error" | "warning" | "info",
      "confidenceBasisPoints": number,
      "riskScore": number,
      "message": string,
      "explanation": string | null,
      "targetSpan": { "tokenIndex"?: number, "textRange"?: { "start": number, "end": number }, "quote"?: string } | null,
      "suggestedText": string | null
    }
  ]
}`;

const extractJsonPayload = (text: string): string => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) return fenced[1].trim();

  const objectMatch = /(\{[\s\S]*\})/.exec(text.trim());
  return objectMatch?.[1]?.trim() ?? text.trim();
};

const buildSemanticReviewPrompt = (input: {
  sourceText: string;
  translationText: string;
  profile: QaReviewProfileConfig;
}) =>
  `Source text:\n${input.sourceText}\n\nTranslation:\n${input.translationText}\n\nEnabled semantic review: ${input.profile.enabledLayers.semantic ? "yes" : "no"}\nMinimum queue risk score: ${input.profile.llm.minRiskScoreForQueue}\n\nReturn JSON only.`;

export type RunSemanticQaReviewInput = {
  projectId: string;
  elementId: number;
  translationId: number;
  sourceText: string;
  translationText: string;
  profile: QaReviewProfileConfig;
  pluginManager?: PluginManager;
  signal?: AbortSignal;
};

export type RunSemanticQaReviewResult = {
  status: "COMPLETED" | "FAILED" | "SKIPPED";
  modelServiceId: number | null;
  summary: string | null;
  errorMessage: string | null;
  findings: NormalizedQaFinding[];
};

/**
 * Run the optional semantic QA review layer and degrade gracefully when disabled, unavailable, or invalid.
 */
export const runSemanticQaReview = async (
  input: RunSemanticQaReviewInput,
): Promise<RunSemanticQaReviewResult> => {
  if (!input.profile.enabledLayers.semantic) {
    return {
      status: "SKIPPED",
      modelServiceId: null,
      summary: "Semantic review disabled",
      errorMessage: null,
      findings: [],
    };
  }

  if (!input.pluginManager) {
    return {
      status: "SKIPPED",
      modelServiceId: null,
      summary: "No LLM provider available",
      errorMessage: null,
      findings: [],
    };
  }

  const llmService = firstOrGivenService(
    input.pluginManager,
    "LLM_PROVIDER",
    input.profile.llm.providerServiceId,
  );

  if (!llmService) {
    return {
      status: "SKIPPED",
      modelServiceId: null,
      summary: "No LLM provider available",
      errorMessage: null,
      findings: [],
    };
  }

  try {
    const response = await collectLLMResponse(
      llmService.service.chat({
        messages: [
          { role: "system", content: SEMANTIC_REVIEW_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildSemanticReviewPrompt({
              sourceText: input.sourceText,
              translationText: input.translationText,
              profile: input.profile,
            }),
          },
        ],
        temperature: input.profile.llm.temperature,
        maxTokens: input.profile.llm.maxTokens,
        thinking: false,
        signal: input.signal,
      }),
    );

    const parsed = SemanticQaReviewResponseSchema.parse(
      JSON.parse(extractJsonPayload(response.content ?? "")),
    );

    return {
      status: "COMPLETED",
      modelServiceId: llmService.id,
      summary: parsed.summary ?? null,
      errorMessage: null,
      findings: parsed.findings.map((finding) => ({
        layer: "SEMANTIC",
        checkerServiceId: null,
        qaResultItemId: null,
        ruleId: finding.ruleId,
        ruleFamily: finding.ruleFamily,
        severity: finding.severity,
        action:
          finding.riskScore >= input.profile.llm.minRiskScoreForQueue
            ? "NEEDS_REVIEW"
            : "INFORMATIONAL",
        disposition: "OPEN",
        confidenceBasisPoints: finding.confidenceBasisPoints,
        riskScore: finding.riskScore,
        message: finding.message,
        explanation: finding.explanation ?? null,
        sourceSpan: null,
        targetSpan: finding.targetSpan ?? null,
        suggestedText: finding.suggestedText ?? null,
        meta: null,
      })),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Invalid semantic review response";

    return {
      status: "FAILED",
      modelServiceId: llmService.id,
      summary: null,
      errorMessage,
      findings: [],
    };
  }
};
