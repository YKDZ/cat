import type { AmbiguityEnvelope } from "@cat/shared/schema/precision-recall";

import type { RecallCandidate } from "./types";

import { applyBandOrder } from "../rerank/apply-band-order";
import { normalizePrecisionCandidates } from "../rerank/normalize";
import { orchestrateRerank } from "../rerank/orchestrator";

type ApplyModelRerankerInput = {
  ranked: RecallCandidate[];
  queryText: string;
  envelope: AmbiguityEnvelope;
  pluginManager?: unknown;
  signal?: AbortSignal;
  rerankMode?: "baseline" | "reranked";
  rerankProviderId?: number;
  rerankTimeoutMs?: number;
};

const noteAll = (
  ranked: RecallCandidate[],
  action: string,
  note: string,
): RecallCandidate[] => {
  for (const c of ranked) {
    c.rankingDecisions.push({ action, note });
  }
  return ranked;
};

const traceToDecisionAction = (outcome: string): string =>
  `model-reranker-${outcome}`;

const reorderByCandidateId = (
  band: RecallCandidate[],
  orderedIds: string[],
): RecallCandidate[] => {
  const byId = new Map(
    band.map((c) => [
      c.surface === "term" ? `term:${c.conceptId}` : `memory:${c.id}`,
      c,
    ]),
  );
  return orderedIds.flatMap((id) => {
    const candidate = byId.get(id);
    return candidate ? [candidate] : [];
  });
};

export async function applyModelReranker(
  input: ApplyModelRerankerInput,
): Promise<RecallCandidate[]> {
  const { ranked, envelope } = input;
  if (!envelope.shouldInvokeModel || input.rerankMode === "baseline") {
    return noteAll(
      ranked,
      "model-reranker-skipped",
      "rerank disabled or no eligible band",
    );
  }

  const band = ranked.slice(
    envelope.eligibleBand.start,
    envelope.eligibleBand.end,
  );
  if (band.length === 0) {
    return noteAll(ranked, "model-reranker-skipped", "empty eligible band");
  }

  const normalizedCandidates = normalizePrecisionCandidates(
    input.queryText,
    band,
  );

  const surface = band[0]?.surface ?? "term";

  const result = await orchestrateRerank({
    request: {
      trigger: "precision-ambiguity",
      surface,
      queryText: input.queryText,
      band: envelope.eligibleBand,
      candidates: normalizedCandidates,
      rerankProviderId: input.rerankProviderId,
      timeoutMs: input.rerankTimeoutMs,
    },
    pluginManager: input.pluginManager,
    signal: input.signal,
  });

  if (result.trace.outcome !== "applied") {
    return noteAll(
      ranked,
      traceToDecisionAction(result.trace.outcome),
      result.trace.message,
    );
  }

  const reorderedBand = reorderByCandidateId(band, result.orderedCandidateIds);
  const updated = applyBandOrder(ranked, envelope.eligibleBand, reorderedBand);
  return noteAll(updated, "model-reranker-applied", result.trace.message);
}
