// packages/operations/src/precision/query-topic-resolver.ts
import type {
  QueryProfile,
  QueryTopicHypothesis,
} from "@cat/shared/schema/precision-recall";

import type { RecallCandidate } from "./types";

/**
 * Infer a QueryTopicHypothesis from the query profile + the Tier-1 candidates
 * already present in the ledger after the Budget Gate.
 *
 * Strategy:
 *  1. Collect topicIds from all candidates that have budgetClass="reserved"
 *     AND topicAssignment.matchState != "conflict".
 *  2. Find the majority topicId (highest frequency).
 *  3. Set confidence:
 *     - "confident"   if ≥2 reserved candidates agree on the majority topic
 *     - "weak"        if only 1 candidate provides the majority topic
 *     - "conflicting" if top-2 topics have the same frequency > 0
 *     - "unknown"     if no reserved candidate has a topic assignment
 *
 * NOTE: element context is NOT an input here (per spec §Component Design / Query Topic Resolver).
 */
export function resolveQueryTopic(
  candidates: RecallCandidate[],
  _profile: QueryProfile,
): QueryTopicHypothesis {
  const reserved = candidates.filter((c) => c.budgetClass === "reserved");

  const topicFreq = new Map<string, number>();
  for (const c of reserved) {
    if (!c.topicAssignment) continue;
    for (const tid of c.topicAssignment.topicIds) {
      topicFreq.set(tid, (topicFreq.get(tid) ?? 0) + 1);
    }
  }

  if (topicFreq.size === 0) {
    return {
      topicIds: [],
      confidence: "unknown",
      note: "no reserved candidates with topic assignment",
    };
  }

  const sorted = [...topicFreq.entries()].sort((a, b) => b[1] - a[1]);
  const [topTopic, topCount] = sorted[0] ?? ["", 0];
  const [, secondCount] = sorted[1] ?? ["", 0];

  if (topCount >= 2) {
    return {
      topicIds: [topTopic],
      confidence: "confident",
      note: `${topCount} reserved candidates agree on topic "${topTopic}"`,
    };
  }
  if (topCount === secondCount && topCount > 0) {
    return {
      topicIds: sorted.filter(([, c]) => c === topCount).map(([t]) => t),
      confidence: "conflicting",
      note: "top topics have equal frequency among reserved candidates",
    };
  }
  return {
    topicIds: [topTopic],
    confidence: "weak",
    note: "only one reserved candidate provides a topic hint",
  };
}
