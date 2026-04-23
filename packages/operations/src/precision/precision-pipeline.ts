// packages/operations/src/precision/precision-pipeline.ts
import type { ProviderStatus } from "@cat/shared/schema/precision-recall";

import type { RawResult, RecallCandidate } from "./types";

import { evaluateAmbiguity } from "./ambiguity-gate";
import { applyBudgetGate } from "./budget-gate";
import { applyDeterministicRanking } from "./deterministic-ranker";
import { buildFusionLedger } from "./fusion-ledger";
import { applyModelReranker } from "./model-reranker";
import { profileQuery } from "./query-profiler";
import { resolveQueryTopic } from "./query-topic-resolver";
import { applyGuardsToCandidates } from "./scope-anchor-guard";
import {
  createTaxonomyRegistry,
  assignTopics,
  type TaxonomyRegistryOptions,
  type CompatibilityTable,
} from "./taxonomy-registry";

export type PrecisionPipelineOptions = {
  queryText: string;
  allowedScopeIds?: string[];
  maxResults?: number;
  taxonomyOptions?: TaxonomyRegistryOptions;
  compatibilityTable?: CompatibilityTable;
  /** Term subjects keyed by conceptId, used for taxonomy assignment. */
  termSubjectMap?: Map<number, string[]>;
  providerStatuses?: ProviderStatus[];
};

/**
 * Run the full precision pipeline on a flat list of raw multi-lane results.
 *
 * This function is surface-agnostic: it works with both RawTermResult[] and
 * RawMemoryResult[] (and mixed arrays, if ever needed).
 */
export async function runPrecisionPipeline(
  raw: RawResult[],
  opts: PrecisionPipelineOptions,
): Promise<RecallCandidate[]> {
  const {
    queryText,
    allowedScopeIds = [],
    maxResults = 20,
    taxonomyOptions,
    compatibilityTable,
    termSubjectMap = new Map<number, string[]>(),
  } = opts;

  if (raw.length === 0) return [];

  // ── Step 1: Query Profiler ───────────────────────────────────────
  const profile = profileQuery(queryText);

  // ── Step 2: Fusion Ledger ────────────────────────────────────────
  const ledger = buildFusionLedger(raw);

  // ── Step 3: Budget Gate ──────────────────────────────────────────
  const budgeted = applyBudgetGate(ledger, profile, { maxTotal: maxResults });

  // ── Step 4: Taxonomy & Topic Resolution ──────────────────────────
  const taxonomyAvailable = Boolean(taxonomyOptions);
  if (taxonomyAvailable && taxonomyOptions) {
    const registry = createTaxonomyRegistry(
      taxonomyOptions,
      compatibilityTable,
    );
    // Preliminary topic assignment with empty queryTopicIds (we don't know yet)
    assignTopics(budgeted, registry, [], termSubjectMap);
    // Now resolve query topic based on reserved candidates
    const hypothesis = resolveQueryTopic(budgeted, profile);
    // Re-assign with the resolved hypothesis
    assignTopics(budgeted, registry, hypothesis.topicIds, termSubjectMap);

    // ── Step 5: Scope & Anchor Guard ──────────────────────────────
    const guarded = applyGuardsToCandidates(budgeted, queryText, hypothesis, {
      allowedScopeIds,
    });

    // ── Step 6: Deterministic Layered Ranker ──────────────────────
    const ranked = applyDeterministicRanking(guarded, profile, hypothesis);

    // ── Step 7: Ambiguity Gate ────────────────────────────────────
    const envelope = evaluateAmbiguity(ranked, hypothesis);

    // ── Step 8: Optional Model Reranker ──────────────────────────
    return applyModelReranker(ranked, envelope);
  }

  // Taxonomy unavailable — run scope/anchor guard with unknown hypothesis,
  // then deterministic ranking (no topic guard active).
  const unknownHypothesis = { topicIds: [], confidence: "unknown" as const };
  const guarded = applyGuardsToCandidates(
    budgeted,
    queryText,
    unknownHypothesis,
    {
      allowedScopeIds,
    },
  );
  const ranked = applyDeterministicRanking(guarded, profile, unknownHypothesis);
  const envelope = evaluateAmbiguity(ranked, unknownHypothesis);
  return applyModelReranker(ranked, envelope);
}
