// packages/operations/src/precision/model-reranker.ts
import type { AmbiguityEnvelope } from "@cat/shared/schema/precision-recall";

import type { RecallCandidate } from "./types";

/**
 * Optional Model Reranker (stub).
 *
 * Currently a no-op: returns the input order unchanged.
 * Future: call a model service for candidates within envelope.eligibleBand.
 *
 * Contract:
 *  - MUST NOT reorder candidates outside the eligible band.
 *  - MUST NOT move a clear Tier-1 winner out of position 0 if they were
 *    not included in the eligible band.
 *  - If the model service fails, MUST return the deterministic order unchanged.
 */
export async function applyModelReranker(
  ranked: RecallCandidate[],
  envelope: AmbiguityEnvelope,
): Promise<RecallCandidate[]> {
  if (!envelope.shouldInvokeModel) return ranked;

  // Stub: no-op
  for (const c of ranked) {
    c.rankingDecisions.push({
      action: "model-reranker-skipped",
      note: "model reranker not yet implemented; deterministic order preserved",
    });
  }

  return ranked;
}
