import type { NormalizedQaFinding } from "@cat/shared";

import { QAIssueSchema } from "@cat/plugin-core";

export const normalizeQaResultItems = (input: {
  qaResultItemIds: number[];
  items: Array<{ isPassed: boolean; checkerId: number; meta: unknown }>;
}): NormalizedQaFinding[] =>
  input.items.flatMap((item, index) => {
    if (item.isPassed) {
      return [
        {
          layer: "DETERMINISTIC",
          checkerServiceId: item.checkerId,
          qaResultItemId: input.qaResultItemIds[index] ?? null,
          ruleId: `checker:${item.checkerId}:pass`,
          ruleFamily: "coverage",
          severity: "info",
          action: "PASS",
          disposition: "OPEN",
          confidenceBasisPoints: 10000,
          riskScore: 0,
          message: "QA checker passed",
          explanation: null,
          sourceSpan: null,
          targetSpan: null,
          suggestedText: null,
          meta: null,
        } satisfies NormalizedQaFinding,
      ];
    }

    const parsed = QAIssueSchema.safeParse(item.meta);
    const issue = parsed.success
      ? parsed.data
      : {
          severity: "warning" as const,
          message: "Invalid QA issue metadata",
          metadata: { raw: item.meta },
        };

    return [
      {
        layer: "DETERMINISTIC",
        checkerServiceId: item.checkerId,
        qaResultItemId: input.qaResultItemIds[index] ?? null,
        ruleId: issue.ruleId ?? `checker:${item.checkerId}`,
        ruleFamily: issue.ruleFamily ?? "generic",
        severity: issue.severity,
        action: issue.defaultAction ?? "NEEDS_REVIEW",
        disposition: "OPEN",
        confidenceBasisPoints: Math.round((issue.confidence ?? 1) * 10000),
        riskScore:
          issue.defaultAction === "BLOCK_APPROVAL"
            ? 100
            : issue.defaultAction === "PASS"
              ? 0
              : issue.severity === "error"
                ? 70
                : issue.severity === "warning"
                  ? 45
                  : 10,
        message: issue.message,
        explanation: null,
        sourceSpan: issue.sourceSpan
          ? {
              textRange: {
                start: issue.sourceSpan.start,
                end: issue.sourceSpan.end,
              },
              quote: issue.sourceSpan.quote,
            }
          : null,
        targetSpan:
          issue.targetSpan || issue.targetTokenIndex !== undefined
            ? {
                tokenIndex: issue.targetTokenIndex,
                textRange: issue.targetSpan
                  ? {
                      start: issue.targetSpan.start,
                      end: issue.targetSpan.end,
                    }
                  : undefined,
                quote: issue.targetSpan?.quote,
              }
            : null,
        suggestedText: issue.suggestedText ?? null,
        meta: issue.metadata ?? null,
      } satisfies NormalizedQaFinding,
    ];
  });
