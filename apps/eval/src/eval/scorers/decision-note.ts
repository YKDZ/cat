// apps/eval/src/eval/scorers/decision-note.ts
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

type ResultWithDecisions = {
  conceptId?: number;
  id?: number;
  rankingDecisions?: Array<{ action: string; tier?: string; note: string }>;
};

/**
 * Decision-note coverage scorer.
 *
 * Checks that every expected top result carries at least one "tier-assigned"
 * ranking decision, confirming that the precision pipeline ran.
 *
 * Score = fraction of expected items that have a tier-assigned decision in results.
 */
export const decisionNoteScorer: Scorer = {
  name: "decision-note",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems, refs } = input;
    if (caseResult.status !== "ok" || !Array.isArray(caseResult.rawOutput)) {
      return [
        {
          name: "decision-note",
          value: 0,
          detail: `case status: ${caseResult.status}`,
        },
      ];
    }

    const results = caseResult.rawOutput as ResultWithDecisions[];

    let totalExpected = 0;
    let withTierDecision = 0;

    for (const expected of expectedItems as Array<{
      conceptRef?: string;
      memoryItemRef?: string;
    }>) {
      const ref = expected.conceptRef ?? expected.memoryItemRef;
      const expectedId = ref ? refs.getId(ref) : undefined;
      if (expectedId === undefined) continue;

      totalExpected += 1;
      const matched = results.find((r) => (r.conceptId ?? r.id) === expectedId);
      if (
        matched?.rankingDecisions?.some((d) => d.action === "tier-assigned")
      ) {
        withTierDecision += 1;
      }
    }

    const score = totalExpected > 0 ? withTierDecision / totalExpected : 1;
    return [
      {
        name: "decision-note",
        value: score,
        detail: `${withTierDecision}/${totalExpected} expected items carry tier-assigned decision`,
      },
    ];
  },
};
