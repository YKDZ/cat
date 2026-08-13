import { serverLogger as logger } from "@cat/server-shared";
import type { LanguageAnalysisToken } from "@cat/shared";

import type {
  RawResult,
  RawMemoryResult,
  RecallCandidate,
} from "../precision/types.ts";
import { candidateKey } from "../precision/types.ts";
import {
  applyHnfPreRules,
  applyHnfPostRules,
  extractContentWordsFromTokens,
} from "./core.ts";
import type { HnfCandidate, HardNegativeRemoval } from "./types.ts";

/**
 * Build an HnfCandidate from a RawMemoryResult.
 */
const toHnfCandidate = (r: RawMemoryResult): HnfCandidate => ({
  surface: "memory",
  candidateKey: candidateKey(r),
  candidateTextLower: r.source.toLowerCase(),
  evidences: r.evidences,
  confidence: r.confidence,
});

/**
 * Apply HNF pre-pipeline rules to memory recall results.
 *
 * @param results - Raw memory recall results
 * @param sourceLanguageAnalysisTokens - Language Analysis tokens of the source text
 * @param queryText - Query text
 * @returns - Removal records
 */
export const applyMemoryHnfPre = (
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
    // Language Analysis tokens not available — skip rules 1 and 3, only apply rule 2
    logger
      .child({ component: "operation" })
      .warn("HNF(memory): no content words, skipping rules 1 and 3");
    return [];
  }

  const candidates: HnfCandidate[] = results
    .filter((r): r is RawMemoryResult => r.surface === "memory")
    .map(toHnfCandidate);

  const { kept, removals } = applyHnfPreRules(
    candidates,
    contentWords,
    keyNouns,
    queryTextLength,
  );

  // Keep filtering and confidence updates atomic for the caller-owned array.
  const keptKeys = new Set(kept.map((c) => c.candidateKey));
  for (const r of results) {
    if (r.surface !== "memory") continue;
    const key = candidateKey(r);
    if (!keptKeys.has(key)) continue;
    const updated = kept.find((c) => c.candidateKey === key);
    if (updated) {
      r.confidence = updated.confidence;
      r.evidences = updated.evidences;
    }
  }
  const retained = results.filter(
    (result) =>
      result.surface !== "memory" || keptKeys.has(candidateKey(result)),
  );
  results.length = 0;
  results.push(...retained);

  return removals;
};

/**
 * Apply HNF post-pipeline rules to ranked memory recall results.
 *
 * @param ranked - Ranked candidates with tier info
 * @param sourceLanguageAnalysisTokens - Language Analysis tokens of the source text
 * @returns - Removal records
 */
export const applyMemoryHnfPost = (
  ranked: RecallCandidate[],
  sourceLanguageAnalysisTokens: LanguageAnalysisToken[],
): HardNegativeRemoval[] => {
  if (ranked.length === 0) return [];

  const { contentWords } = extractContentWordsFromTokens(
    sourceLanguageAnalysisTokens,
  );
  if (contentWords.length === 0) {
    logger
      .child({ component: "operation" })
      .warn("HNF(memory,post): no content words, skipping");
    return [];
  }

  const candidates = ranked
    .filter(
      (r): r is RecallCandidate & { surface: "memory" } =>
        r.surface === "memory" && r.tier === "3",
    )
    .map(
      (r): HnfCandidate => ({
        surface: "memory",
        candidateKey: `memory:${r.id}`,
        candidateTextLower: r.source.toLowerCase(),
        evidences: r.evidences,
        confidence: r.evidences.reduce(
          (max, e) => Math.max(max, e.confidence),
          0,
        ),
      }),
    )
    .map((c) => ({ ...c, tier: "3" as const }));

  const { removals } = applyHnfPostRules(
    candidates as Array<HnfCandidate & { tier?: string }>,
    contentWords,
  );

  // Mark filtered candidates in the ranked array
  const removedKeys = new Set(removals.map((r) => r.candidateKey));
  for (const r of ranked) {
    if (r.surface !== "memory") continue;
    const key = `memory:${r.id}`;
    if (removedKeys.has(key)) {
      r.hardFiltered = true;
      r.hardFilterReason = "tier3-isolated-semantic";
    }
  }

  return removals;
};
