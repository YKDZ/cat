import type {
  RerankCandidateDocument,
  RerankDecisionTrace,
  RerankRequest,
  RerankResponse,
  RerankScoreEntrySchema,
} from "@cat/shared";

import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import * as z from "zod";

type ScoreEntry = z.infer<typeof RerankScoreEntrySchema>;

type OrchestrateRerankInput = {
  request: RerankRequest;
  pluginManager: unknown;
  signal?: AbortSignal;
};

type OrchestrateRerankResult = {
  orderedCandidateIds: string[];
  trace: RerankDecisionTrace;
};

const failClosedTrace = (
  request: RerankRequest,
  outcome: RerankDecisionTrace["outcome"],
  message: string,
  provider?: {
    id: number;
    service: { getId(): string; getModelName(): string };
  },
): OrchestrateRerankResult => ({
  orderedCandidateIds: request.candidates.map((c) => c.candidateId),
  trace: {
    trigger: request.trigger,
    outcome,
    band: request.band,
    message,
    ...(provider
      ? {
          metadata: {
            providerId: provider.service.getId(),
            modelId: provider.service.getModelName(),
          },
        }
      : {}),
  },
});

/**
 * Validate that response.scores maps exactly onto the candidates in the request:
 * - Every candidateId in scores must exist in request.candidates
 * - No duplicate IDs
 * - Every score must be finite
 * - Count must match
 *
 * Returns the validated scores array, or null if validation fails.
 */
const validateScoreCoverage = (
  candidates: RerankCandidateDocument[],
  scores: ScoreEntry[],
): ScoreEntry[] | null => {
  const candidateIds = new Set(candidates.map((c) => c.candidateId));

  if (scores.length !== candidates.length) return null;

  const seen = new Set<string>();
  for (const entry of scores) {
    if (!candidateIds.has(entry.candidateId)) return null;
    if (seen.has(entry.candidateId)) return null;
    if (!Number.isFinite(entry.score)) return null;
    seen.add(entry.candidateId);
  }
  return scores;
};

export const orchestrateRerank = async ({
  request,
  pluginManager,
  signal,
}: OrchestrateRerankInput): Promise<OrchestrateRerankResult> => {
  const manager = resolvePluginManager(pluginManager);
  const provider = firstOrGivenService(
    manager,
    "RERANK_PROVIDER",
    request.rerankProviderId,
  );

  if (!provider) {
    return {
      orderedCandidateIds: request.candidates.map((c) => c.candidateId),
      trace: {
        trigger: request.trigger,
        outcome: "unavailable",
        band: request.band,
        message: "no RERANK_PROVIDER service is configured",
      },
    };
  }

  let response: RerankResponse;
  try {
    response = await provider.service.rerank({ request, signal });
  } catch (error) {
    if (signal?.aborted) {
      return failClosedTrace(
        request,
        "cancelled",
        "rerank cancelled",
        provider,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    const outcome = /timeout|timed out/i.test(message)
      ? "timeout"
      : "fail-closed";
    return failClosedTrace(request, outcome, message, provider);
  }

  const validatedScores = validateScoreCoverage(
    request.candidates,
    response.scores,
  );
  if (!validatedScores) {
    return failClosedTrace(
      request,
      "invalid-response",
      "provider scores do not cover all candidates or contain invalid values",
      provider,
    );
  }

  const orderedCandidateIds = [...validatedScores]
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.candidateId);

  return {
    orderedCandidateIds,
    trace: {
      trigger: request.trigger,
      outcome: "applied",
      band: request.band,
      message: `reranked ${orderedCandidateIds.length} candidates`,
      metadata: {
        providerId: provider.service.getId(),
        modelId: provider.service.getModelName(),
        ...response.metadata,
      },
    },
  };
};
