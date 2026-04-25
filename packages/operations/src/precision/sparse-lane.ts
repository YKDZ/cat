// packages/operations/src/precision/sparse-lane.ts
import type { RecallEvidence } from "@cat/shared";

import type { RawResult } from "./types";

/**
 * Compute a sparse lexical evidence entry for a candidate.
 *
 * Score = (number of matched content words) / (total query content words)
 * A score above minScore generates an evidence entry with channel="sparse".
 *
 * @param queryContentWords — non-stop, non-punct lowercased tokens from query
 * @param candidateSource   — source text of the candidate
 * @param minScore          — minimum score to emit evidence (default 0.3)
 */
export function computeSparseEvidence(
  queryContentWords: string[],
  candidateSource: string,
  minScore = 0.3,
): RecallEvidence | null {
  if (queryContentWords.length === 0) return null;

  const sourceLower = candidateSource.toLowerCase();
  let hits = 0;
  const matchedWords: string[] = [];

  for (const word of queryContentWords) {
    if (sourceLower.includes(word)) {
      hits += 1;
      matchedWords.push(word);
    }
  }

  const score = hits / queryContentWords.length;
  if (score < minScore) return null;

  return {
    channel: "sparse",
    confidence: score,
    matchedText: matchedWords.join(" "),
    note: `sparse: ${hits}/${queryContentWords.length} content words matched`,
  };
}

/**
 * Augment raw results with sparse evidence where applicable.
 * Mutates the evidences array of each result in-place.
 */
export function augmentWithSparseLane(
  results: RawResult[],
  queryContentWords: string[],
  minScore = 0.3,
): void {
  for (const r of results) {
    const source = r.surface === "term" ? r.term : r.source;
    const ev = computeSparseEvidence(queryContentWords, source, minScore);
    if (ev) {
      r.evidences.push(ev);
    }
  }
}
