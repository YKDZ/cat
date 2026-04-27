import type { Scorer, ScorerInput, ScoreValue } from "../types";

export const preserveRateScorer: Scorer = {
  name: "preserve-rate",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [{ name: "preserve-rate", value: 0 }];
    }

    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
    const results = caseResult.rawOutput as Array<{
      translation?: string;
    }>;
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

    let checked = 0;
    let preserved = 0;

    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
    for (const expected of expectedItems as Array<{
      expectedText?: string;
      elementRef?: string;
    }>) {
      /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */
      if (!expected.expectedText) continue;

      const result = results[checked]; // Positional match (results ordered by elementRefs)
      if (result && result.translation === expected.expectedText) {
        preserved += 1;
      }
      checked += 1;
    }

    return [
      {
        name: "preserve-rate",
        value: checked > 0 ? preserved / checked : 1,
        detail: `${preserved}/${checked} preserved as-is`,
      },
    ];
  },
};
