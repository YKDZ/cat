// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- rawOutput requires casting from unknown
import type { Scorer, ScorerInput, ScoreValue } from "../types";

const MAX_NGRAM_ORDER = 6;
const BETA = 2;

type Translation = { elementRef: string; text: string };
type AgentTranslateOutput = { translations?: Translation[] };

const getNgrams = (text: string, n: number): Map<string, number> => {
  const ngrams = new Map<string, number>();
  for (let i = 0; i <= text.length - n; i += 1) {
    const ng = text.slice(i, i + n);
    ngrams.set(ng, (ngrams.get(ng) ?? 0) + 1);
  }
  return ngrams;
};

const countNgrams = (ngrams: Map<string, number>): number =>
  [...ngrams.values()].reduce((a, b) => a + b, 0);

/**
 * Compute chrF2 (character n-gram F-score with beta=2) between hypothesis and
 * reference. Averages precision and recall across n-gram orders 1–6 before
 * applying the F-score formula.
 */
const computeChrF = (hypothesis: string, reference: string): number => {
  if (hypothesis.length === 0 && reference.length === 0) return 1;
  if (hypothesis.length === 0 || reference.length === 0) return 0;

  let sumPrecision = 0;
  let sumRecall = 0;
  let validOrders = 0;

  for (let n = 1; n <= MAX_NGRAM_ORDER; n += 1) {
    const hypNgrams = getNgrams(hypothesis, n);
    const refNgrams = getNgrams(reference, n);
    const hypCount = countNgrams(hypNgrams);
    const refCount = countNgrams(refNgrams);

    if (hypCount === 0 && refCount === 0) continue;

    let matched = 0;
    for (const [ng, cnt] of hypNgrams) {
      matched += Math.min(cnt, refNgrams.get(ng) ?? 0);
    }

    sumPrecision += hypCount > 0 ? matched / hypCount : 0;
    sumRecall += refCount > 0 ? matched / refCount : 0;
    validOrders += 1;
  }

  if (validOrders === 0) return 0;

  const avgPrec = sumPrecision / validOrders;
  const avgRec = sumRecall / validOrders;

  if (avgPrec + avgRec === 0) return 0;

  const beta2 = BETA * BETA;
  return ((1 + beta2) * avgPrec * avgRec) / (beta2 * avgPrec + avgRec);
};

/**
 * chrF2 scorer for agent-translate scenarios.
 * 字符 F 值（chrF2）评分器，用于 agent 翻译场景。
 */
export const chrfScorer: Scorer = {
  name: "chrf",
  score: (input: ScorerInput): ScoreValue[] => {
    const { caseResult, expectedItems } = input;
    if (caseResult.status !== "ok") {
      return [
        {
          name: "chrf",
          value: 0,
          detail: `case status: ${caseResult.status}`,
        },
      ];
    }

    const output = caseResult.rawOutput as AgentTranslateOutput;
    const translationMap = new Map<string, string>(
      (output?.translations ?? []).map((t) => [t.elementRef, t.text]),
    );

    const scores: number[] = [];

    for (const item of expectedItems as Array<{
      elementRef?: string;
      expectedText?: string;
    }>) {
      if (!item.elementRef || !item.expectedText) continue;
      const translation = translationMap.get(item.elementRef);
      if (translation !== undefined) {
        scores.push(computeChrF(translation, item.expectedText));
      }
    }

    if (scores.length === 0) {
      return [
        {
          name: "chrf",
          value: 0,
          detail: "no translation matches any expected element",
        },
      ];
    }

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return [{ name: "chrf", value: avg }];
  },
};
