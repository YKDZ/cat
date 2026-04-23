// packages/operations/src/precision/scope-anchor-guard.ts
import type {
  AnchorSignature,
  QueryTopicHypothesis,
} from "@cat/shared/schema/precision-recall";

import type { RecallCandidate } from "./types";

export type ScopeGuardOptions = {
  /** Allowed scope IDs for this query. Empty = accept all. */
  allowedScopeIds: string[];
};

/** Extract numbers and placeholders from text. */
function extractAnchors(text: string): {
  numbers: string[];
  placeholders: string[];
} {
  const numbers = [...text.matchAll(/\b\d[\d.,]*\b/g)].map((m) => m[0]);
  const placeholders = [
    ...text.matchAll(/%[sd]|\{[^}]+\}|\$[a-zA-Z_]\w*/g),
  ].map((m) => m[0]);
  return { numbers, placeholders };
}

/** Build an AnchorSignature comparing query vs candidate source text. */
export function buildAnchorSignature(
  queryText: string,
  candidateSource: string,
): AnchorSignature {
  const qAnchors = extractAnchors(queryText);
  const cAnchors = extractAnchors(candidateSource);

  const numbersCompatible = qAnchors.numbers.every((n) =>
    cAnchors.numbers.includes(n),
  );
  const placeholdersCompatible = qAnchors.placeholders.every((p) =>
    cAnchors.placeholders.includes(p),
  );

  return {
    queryNumbers: qAnchors.numbers,
    queryPlaceholders: qAnchors.placeholders,
    candidateNumbers: cAnchors.numbers,
    candidatePlaceholders: cAnchors.placeholders,
    numbersCompatible,
    placeholdersCompatible,
  };
}

export type GuardResult =
  | "pass"
  | "recoverable-conflict"
  | "non-recoverable-conflict";

/**
 * Apply all three guards to a single candidate.
 *
 * Hard-filter (non-recoverable) conditions per spec §Component Design / Scope & Anchor Guard:
 *  - Scope: candidate scopeId not in allowedScopeIds (when allowedScopeIds.length > 0)
 *  - Topic: topicAssignment.matchState === "conflict" AND query hypothesis is "confident"
 *  - Anchor: numeric conflict (query has numbers, candidate has different numbers)
 *
 * Recoverable-conflict conditions:
 *  - Topic: topicAssignment.matchState === "unknown" AND query hypothesis is "confident"
 *  - Anchor: placeholder count mismatch (query has placeholders not in candidate)
 */
export function applyGuards(
  candidate: RecallCandidate,
  queryText: string,
  hypothesis: QueryTopicHypothesis,
  opts: ScopeGuardOptions,
): { result: GuardResult; note: string } {
  // ── Scope Guard ─────────────────────────────────────────────────
  const scopeId =
    candidate.surface === "term" ? candidate.glossaryId : candidate.memoryId;

  if (
    opts.allowedScopeIds.length > 0 &&
    scopeId &&
    !opts.allowedScopeIds.includes(scopeId)
  ) {
    return {
      result: "non-recoverable-conflict",
      note: `scope-filter: candidate scope "${scopeId}" not in allowed set`,
    };
  }

  // ── Topic Guard ──────────────────────────────────────────────────
  const topicState = candidate.topicAssignment?.matchState ?? "unknown";
  if (topicState === "conflict" && hypothesis.confidence === "confident") {
    return {
      result: "non-recoverable-conflict",
      note: `topic-conflict: candidate topics ${JSON.stringify(candidate.topicAssignment?.topicIds)} conflict with query hypothesis ${JSON.stringify(hypothesis.topicIds)}`,
    };
  }

  // ── Anchor Guard ────────────────────────────────────────────────
  const candidateSource =
    candidate.surface === "term" ? candidate.term : candidate.source;
  const anchor = buildAnchorSignature(queryText, candidateSource);
  candidate.anchorSignature = anchor;

  // Template matches are designed for numeric substitution — skip the numeric
  // conflict check so they are not incorrectly hard-filtered.
  const isTemplateMatch = candidate.evidences.some(
    (e) => e.channel === "template",
  );

  if (
    !isTemplateMatch &&
    !anchor.numbersCompatible &&
    anchor.queryNumbers.length > 0
  ) {
    return {
      result: "non-recoverable-conflict",
      note: `anchor-conflict: query numbers ${JSON.stringify(anchor.queryNumbers)} not matched in candidate`,
    };
  }

  if (!anchor.placeholdersCompatible && anchor.queryPlaceholders.length > 0) {
    return {
      result: "recoverable-conflict",
      note: `anchor-mismatch: query placeholders ${JSON.stringify(anchor.queryPlaceholders)} not all present in candidate`,
    };
  }

  if (topicState === "unknown" && hypothesis.confidence === "confident") {
    return {
      result: "recoverable-conflict",
      note: `topic-unknown-staged: candidate topic unknown but query topic confident`,
    };
  }

  return { result: "pass", note: "guards passed" };
}

/**
 * Apply guards to all candidates in the ledger.
 * Hard-filtered candidates are marked with hardFiltered=true and removed from return value.
 * Recoverable-conflict candidates get a demotion decision note.
 */
export function applyGuardsToCandidates(
  candidates: RecallCandidate[],
  queryText: string,
  hypothesis: QueryTopicHypothesis,
  opts: ScopeGuardOptions,
): RecallCandidate[] {
  const passing: RecallCandidate[] = [];

  for (const c of candidates) {
    const { result, note } = applyGuards(c, queryText, hypothesis, opts);

    if (result === "non-recoverable-conflict") {
      c.hardFiltered = true;
      c.hardFilterReason = note;
      c.rankingDecisions.push({ action: "hard-filter", note });
      // Hard-filtered candidates are excluded from the returned array
    } else if (result === "recoverable-conflict") {
      c.rankingDecisions.push({ action: "recoverable-demotion", note });
      passing.push(c);
    } else {
      c.rankingDecisions.push({ action: "guard-passed", note });
      passing.push(c);
    }
  }

  return passing;
}
