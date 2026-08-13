import { serverLogger as logger } from "@cat/server-shared";
import type { LanguageAnalysisToken } from "@cat/shared";

import type { RawResult, RawTermResult } from "../precision/types.ts";
import { candidateKey } from "../precision/types.ts";
import { applyHnfPreRules, extractContentWordsFromTokens } from "./core.ts";
import type { HnfCandidate, HardNegativeRemoval } from "./types.ts";

const toHnfCandidate = (r: RawTermResult): HnfCandidate => ({
  surface: "term",
  candidateKey: candidateKey(r),
  candidateTextLower: r.term.toLowerCase(),
  evidences: r.evidences,
  confidence: r.confidence,
});

/**
 * Apply HNF pre-pipeline rules to term recall results.
 */
export const applyTermHnfPre = (
  results: RawResult[],
  sourceLanguageAnalysisTokens: LanguageAnalysisToken[],
  queryText: string,
): HardNegativeRemoval[] => {
  if (results.length === 0) return [];

  const { contentWords, keyNouns } = extractContentWordsFromTokens(
    sourceLanguageAnalysisTokens,
  );
  const queryTextLength = queryText.length;

  if (contentWords.length === 0) {
    logger
      .child({ component: "operation" })
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
    if (!keptKeys.has(key)) continue;
    const updated = kept.find((c) => c.candidateKey === key);
    if (updated) {
      r.confidence = updated.confidence;
      r.evidences = updated.evidences;
    }
  }
  const retained = results.filter(
    (result) => result.surface !== "term" || keptKeys.has(candidateKey(result)),
  );
  results.length = 0;
  results.push(...retained);

  return removals;
};
