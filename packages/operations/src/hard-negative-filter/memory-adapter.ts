import { serverLogger as logger } from "@cat/server-shared";

import type {
  RawResult,
  RawMemoryResult,
  RecallCandidate,
} from "../precision/types";
import type { HnfCandidate, HardNegativeRemoval } from "./types";

import { candidateKey } from "../precision/types";
import {
  applyHnfPreRules,
  applyHnfPostRules,
  extractContentWordsFromTokens,
} from "./core";

/**
 * @zh 从 RawMemoryResult 构造 HnfCandidate。
 * @en Build an HnfCandidate from a RawMemoryResult.
 */
const toHnfCandidate = (r: RawMemoryResult): HnfCandidate => ({
  surface: "memory",
  candidateKey: candidateKey(r),
  candidateTextLower: r.source.toLowerCase(),
  evidences: r.evidences,
  confidence: r.confidence,
});

/**
 * @zh 将 HNF 预管道规则应用于 memory recall 结果。
 * @en Apply HNF pre-pipeline rules to memory recall results.
 *
 * @param results - {@zh 原始内存召回结果（in-place mutation of confidence）} {@en Raw memory recall results}
 * @param sourceNlpTokens - {@zh 源文本的 NLP tokens} {@en NLP tokens of the source text}
 * @param queryText - {@zh 查询文本} {@en Query text}
 * @returns - {@zh 移除记录} {@en Removal records}
 */
export const applyMemoryHnfPre = (
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
    // NLP tokens not available — skip rules 1 and 3, only apply rule 2
    logger
      .withSituation("OP")
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

  // In-place mutation: update confidence and evidences for kept candidates, remove filtered ones
  const keptKeys = new Set(kept.map((c) => c.candidateKey));
  for (const r of results) {
    if (r.surface !== "memory") continue;
    const key = candidateKey(r);
    if (!keptKeys.has(key)) {
      // Mark for removal from results array
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

/**
 * @zh 将 HNF 后管道规则应用于精排后的 memory recall 结果。
 * @en Apply HNF post-pipeline rules to ranked memory recall results.
 *
 * @param ranked - {@zh 精排后的候选列表} {@en Ranked candidates with tier info}
 * @param sourceNlpTokens - {@zh 源文本的 NLP tokens} {@en NLP tokens of the source text}
 * @returns - {@zh 移除记录} {@en Removal records}
 */
export const applyMemoryHnfPost = (
  ranked: RecallCandidate[],
  sourceNlpTokens: Array<{
    lemma: string;
    isStop: boolean;
    isPunct: boolean;
    pos: string;
  }>,
): HardNegativeRemoval[] => {
  if (ranked.length === 0) return [];

  const { contentWords } = extractContentWordsFromTokens(sourceNlpTokens);
  if (contentWords.length === 0) {
    logger
      .withSituation("OP")
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
