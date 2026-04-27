import { serverLogger as logger } from "@cat/server-shared";

import type { RawResult, RawTermResult } from "../precision/types";
import type { HnfCandidate, HardNegativeRemoval } from "./types";

import { candidateKey } from "../precision/types";
import { applyHnfPreRules, extractContentWordsFromTokens } from "./core";

const toHnfCandidate = (r: RawTermResult): HnfCandidate => ({
  surface: "term",
  candidateKey: candidateKey(r),
  candidateTextLower: r.term.toLowerCase(),
  evidences: r.evidences,
  confidence: r.confidence,
});

/**
 * @zh 将 HNF 预管道规则应用于 term recall 结果。
 * @en Apply HNF pre-pipeline rules to term recall results.
 */
export const applyTermHnfPre = (
  results: RawResult[],
  sourceNlpTokens: Array<{
    lemma: string;
    isStop: boolean;
    isPunct: boolean;
    pos: string;
  }>,
  queryText: string,
): HardNegativeRemoval[] => {
  if (results.length === 0) return [];

  const { contentWords, keyNouns } =
    extractContentWordsFromTokens(sourceNlpTokens);
  const queryTextLength = queryText.length;

  if (contentWords.length === 0) {
    logger
      .withSituation("OP")
      .warn("HNF(term): no content words, skipping rules 1 and 3");
    return [];
  }

  const candidates: HnfCandidate[] = results
    .filter((r): r is RawTermResult => r.surface === "term")
    .map(toHnfCandidate);

  const { kept, removals } = applyHnfPreRules(
    candidates,
    contentWords,
    keyNouns,
    queryTextLength,
  );

  const keptKeys = new Set(kept.map((c) => c.candidateKey));
  for (const r of results) {
    if (r.surface !== "term") continue;
    const key = candidateKey(r);
    if (!keptKeys.has(key)) {
      (r as Record<string, unknown>)["_hnfRemoved"] = true;
      continue;
    }
    const updated = kept.find((c) => c.candidateKey === key);
    if (updated) {
      r.confidence = updated.confidence;
      r.evidences = updated.evidences;
    }
  }

  return removals;
};
