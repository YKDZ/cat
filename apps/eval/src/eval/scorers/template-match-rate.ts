import type { Scorer, ScorerInput, ScoreValue } from "../types";

export const templateMatchRateScorer: Scorer = {
  name: "template-match-rate",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [{ name: "template-match-rate", value: 0 }];
    }

    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
    const results = caseResult.rawOutput as Array<{
      matchedVariantType?: string;
      confidence?: number;
    }>;
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

    const templateResults = results.filter(
      (r) => r.matchedVariantType === "TOKEN_TEMPLATE",
    );

    if (templateResults.length === 0) {
      return [
        {
          name: "template-match-rate",
          value: 0,
          detail: "no template variants",
        },
      ];
    }

    const highConfidence = templateResults.filter(
      (r) => (r.confidence ?? 0) >= 0.95,
    );

    return [
      {
        name: "template-match-rate",
        value: highConfidence.length / templateResults.length,
        detail: `${highConfidence.length}/${templateResults.length} >= 0.95`,
      },
    ];
  },
};
