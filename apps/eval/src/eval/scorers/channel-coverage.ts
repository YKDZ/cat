// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types.ts";

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

const outcomeForEvidenceChannel = (channel: string) => {
  if (channel === "exact") return "EXACT" as const;
  if (channel === "trgm" || channel === "lexical") return "FUZZY" as const;
  if (channel === "keyword") return "KEYWORD" as const;
  if (
    channel === "morphological" ||
    channel === "template" ||
    channel === "fragment"
  ) {
    return "VARIANT" as const;
  }
  if (channel === "semantic") return "SEMANTIC" as const;
  return undefined;
};

/**
 * Evidence channel coverage scorer.
 * Verifies that the expected recall channels participated in matching.
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
        const outcomeChannel = outcomeForEvidenceChannel(ch);
        const outcome = outcomeChannel
          ? caseResult.recallResult?.outcomes[outcomeChannel]
          : undefined;
        const outcomeCandidate =
          outcome?.status === "SUCCEEDED"
            ? outcome.candidates.find(
                (candidate) =>
                  (candidate.id ?? candidate.conceptId) === expectedId,
              )
            : undefined;
        const outcomeHasEvidence = outcomeCandidate?.evidences.some(
          (evidence) => evidence.channel === ch,
        );
        if (
          caseResult.recallResult === undefined
            ? presentChannels.has(ch)
            : outcomeHasEvidence
        ) {
          totalCovered += 1;
        }
      }
    }

    const coverage = totalRequired > 0 ? totalCovered / totalRequired : 1;
    return [{ name: "channel-coverage", value: coverage }];
  },
};
