// packages/operations/src/precision/taxonomy-registry.ts
import type {
  CandidateTopicAssignment,
  MemoryTopicBinding,
  TopicMatchState,
} from "@cat/shared/schema/precision-recall";

import type { RecallCandidate } from "./types";

export type TaxonomyRegistryOptions = {
  /** Map from raw subject string (from termConceptSubject.subject) to canonical topic id. */
  subjectToTopicMap: Map<string, string>;
  /** Default topic ids for memory containers (memoryId → topicIds[]). */
  memoryContainerDefaults: Map<string, string[]>;
  /** Item-level topic overrides (memoryItemId → topicIds[]). */
  memoryItemOverrides: Map<number, string[]>;
};

/** Canonical topic compatibility table: topicId → Set of compatible topicIds */
export type CompatibilityTable = Map<string, Set<string>>;

export type TaxonomyRegistry = {
  assignTopicToTermCandidate: (
    conceptSubjects: string[],
    queryTopicIds: string[],
  ) => CandidateTopicAssignment;

  assignTopicToMemoryCandidate: (
    memoryId: string,
    itemId: number,
    queryTopicIds: string[],
  ) => CandidateTopicAssignment & { binding: MemoryTopicBinding };
};

/**
 * Create a TaxonomyRegistry from static options.
 *
 * Compatible-topic resolution (first phase): two topics are compatible if
 * they are identical OR if the compatibility table explicitly lists them as
 * compatible. Anything else is "unknown" if the candidate has no topic
 * assignment, or "conflict" if it has a topic assignment that is NOT in the
 * compatible set.
 */
export function createTaxonomyRegistry(
  opts: TaxonomyRegistryOptions,
  compatibility: CompatibilityTable = new Map(),
): TaxonomyRegistry {
  const resolveMatchState = (
    candidateTopicIds: string[],
    queryTopicIds: string[],
  ): TopicMatchState => {
    if (candidateTopicIds.length === 0 || queryTopicIds.length === 0) {
      return "unknown";
    }
    for (const ct of candidateTopicIds) {
      for (const qt of queryTopicIds) {
        if (ct === qt) return "compatible";
        if (compatibility.get(ct)?.has(qt)) return "compatible";
      }
    }
    // Has candidate topics but none are compatible → conflict
    return "conflict";
  };

  return {
    assignTopicToTermCandidate(conceptSubjects, queryTopicIds) {
      const topicIds = conceptSubjects
        .map((s) => opts.subjectToTopicMap.get(s))
        .filter((t): t is string => t !== undefined);

      const matchState = resolveMatchState(topicIds, queryTopicIds);

      return {
        topicIds,
        source: "term-subject",
        matchState,
      };
    },

    assignTopicToMemoryCandidate(memoryId, itemId, queryTopicIds) {
      const containerDefault = opts.memoryContainerDefaults.get(memoryId) ?? [];
      const itemOverride = opts.memoryItemOverrides.get(itemId);
      const effective =
        itemOverride && itemOverride.length > 0
          ? itemOverride
          : containerDefault;

      const binding: MemoryTopicBinding = {
        containerDefault,
        itemOverride,
        effective,
      };

      const matchState = resolveMatchState(effective, queryTopicIds);

      return {
        topicIds: effective,
        source: itemOverride
          ? "memory-item-override"
          : "memory-container-default",
        matchState,
        binding,
      };
    },
  };
}

/**
 * Apply taxonomy assignments to an array of RecallCandidates in-place.
 * Mutates `candidate.topicAssignment`.
 */
export function assignTopics(
  candidates: RecallCandidate[],
  registry: TaxonomyRegistry,
  queryTopicIds: string[],
  /** Provides term subjects keyed by conceptId. */
  termSubjectMap: Map<number, string[]>,
): void {
  for (const candidate of candidates) {
    if (candidate.surface === "term") {
      const subjects = termSubjectMap.get(candidate.conceptId) ?? [];
      candidate.topicAssignment = registry.assignTopicToTermCandidate(
        subjects,
        queryTopicIds,
      );
    } else {
      const result = registry.assignTopicToMemoryCandidate(
        candidate.memoryId,
        candidate.id,
        queryTopicIds,
      );
      candidate.topicAssignment = {
        topicIds: result.topicIds,
        source: result.source,
        matchState: result.matchState,
      };
      candidate.topicBinding = result.binding;
    }
  }
}
