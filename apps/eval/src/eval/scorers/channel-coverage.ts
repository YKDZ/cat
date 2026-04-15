// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

type RecallEvidence = {
  channel: string;
  matchedText?: string;
  confidence: number;
};

type ResultWithEvidences = {
  conceptId?: number;
  id?: number;
  evidences?: RecallEvidence[];
};

/**
 * Evidence channel coverage scorer.
 * 验证预期的召回通道是否实际参与了匹配。
 */
export const channelCoverageScorer: Scorer = {
  name: "channel-coverage",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems, refs } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [{ name: "channel-coverage", value: 0 }];
    }

    const results = caseResult.rawOutput as ResultWithEvidences[];
    let totalRequired = 0;
    let totalCovered = 0;

    for (const expected of expectedItems as Array<{
      conceptRef?: string;
      memoryItemRef?: string;
      requiredChannels?: string[];
    }>) {
      const channels = expected.requiredChannels;
      if (!channels || channels.length === 0) continue;

      const ref = expected.conceptRef ?? expected.memoryItemRef;
      const expectedId = ref ? refs.getId(ref) : undefined;
      if (expectedId === undefined) continue;

      const matchedResult = results.find(
        (r) => (r.conceptId ?? r.id) === expectedId,
      );
      if (!matchedResult) {
        totalRequired += channels.length;
        continue;
      }

      const presentChannels = new Set(
        (matchedResult.evidences ?? []).map((e) => e.channel),
      );

      for (const ch of channels) {
        totalRequired += 1;
        if (presentChannels.has(ch)) totalCovered += 1;
      }
    }

    const coverage = totalRequired > 0 ? totalCovered / totalRequired : 1;
    return [{ name: "channel-coverage", value: coverage }];
  },
};
