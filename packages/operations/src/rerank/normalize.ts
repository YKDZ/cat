import type { RerankCandidateDocument } from "@cat/shared";

import type {
  RecallCandidate,
  RawTermResult,
  RawMemoryResult,
} from "../precision/types";

/**
 * Normalize a term candidate into a RerankCandidateDocument for provider submission.
 */
export const normalizePrecisionTermCandidate = (
  c: RecallCandidate & RawTermResult,
  index: number,
): RerankCandidateDocument => ({
  candidateId: `term:${c.conceptId}`,
  surface: "term",
  originalIndex: index,
  originalConfidence: c.confidence,
  title: c.term,
  sourceText: c.matchedText ?? c.term,
  targetText: c.translation,
  definitionText: c.definition ?? undefined,
});

/**
 * Normalize a memory candidate into a RerankCandidateDocument for provider submission.
 */
export const normalizePrecisionMemoryCandidate = (
  c: RecallCandidate & RawMemoryResult,
  index: number,
): RerankCandidateDocument => ({
  candidateId: `memory:${c.id}`,
  surface: "memory",
  originalIndex: index,
  originalConfidence: c.confidence,
  title: c.source,
  sourceText: c.matchedText ?? c.source,
  targetText: c.translation,
});

/**
 * Normalize a slice of RecallCandidates into RerankCandidateDocuments.
 * The index is relative to the slice (for stable candidateId ordering).
 */
export const normalizePrecisionCandidates = (
  _queryText: string,
  band: RecallCandidate[],
): RerankCandidateDocument[] =>
  band.map((c, index) => {
    if (c.surface === "term") {
      return normalizePrecisionTermCandidate(
        c as RecallCandidate & RawTermResult,
        index,
      );
    }
    return normalizePrecisionMemoryCandidate(
      c as RecallCandidate & RawMemoryResult,
      index,
    );
  });
