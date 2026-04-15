// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

/**
 * Confidence accuracy scorer — fraction of matches meeting minimumConfidence.
 * 置信度准确率评分器 — 达到最低置信度要求的匹配比例。
 */
export const confidenceScorer: Scorer = {
  name: "confidence",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems, refs } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [{ name: "confidence", value: 0 }];
    }

    const results = caseResult.rawOutput as Array<{
      conceptId?: number;
      id?: number;
      confidence?: number;
    }>;

    let checked = 0;
    let passed = 0;

    for (const expected of expectedItems as Array<{
      conceptRef?: string;
      memoryItemRef?: string;
      minimumConfidence?: number;
    }>) {
      if (expected.minimumConfidence === undefined) continue;

      const ref = expected.conceptRef ?? expected.memoryItemRef;
      const expectedId = ref ? refs.getId(ref) : undefined;
      if (expectedId === undefined) continue;

      const matched = results.find((r) => (r.conceptId ?? r.id) === expectedId);
      checked += 1;
      if (matched && (matched.confidence ?? 0) >= expected.minimumConfidence) {
        passed += 1;
      }
    }

    return [
      {
        name: "confidence",
        value: checked > 0 ? passed / checked : 1,
      },
    ];
  },
};
