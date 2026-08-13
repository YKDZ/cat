import type {
  CandidateChannelBlocker,
  CandidateChannelOutcome,
  CandidateRecallResult,
  EvidencedRecallCandidate,
  OperationFailureInput,
  RecallEvidence,
  TaskAffectedResource,
} from "@cat/shared";

type RecallCandidate = {
  confidence: number;
  evidences: RecallEvidence[];
};

const requireCandidateEvidence = <TCandidate extends RecallCandidate>(
  candidate: TCandidate,
): EvidencedRecallCandidate<TCandidate> => {
  const [firstEvidence, ...remainingEvidence] = candidate.evidences;
  if (!firstEvidence) {
    throw new TypeError("Successful recall candidate is missing evidence.");
  }
  return {
    ...candidate,
    evidences: [firstEvidence, ...remainingEvidence],
  };
};

export const createSucceededCandidateChannelOutcome = <
  TCandidate extends RecallCandidate,
>(
  candidates: TCandidate[],
): CandidateChannelOutcome<TCandidate> => {
  const [firstCandidate, ...remainingCandidates] = candidates;
  if (!firstCandidate) {
    throw new TypeError("Successful Candidate Channel is empty.");
  }
  return {
    status: "SUCCEEDED",
    candidates: [
      requireCandidateEvidence(firstCandidate),
      ...remainingCandidates.map(requireCandidateEvidence),
    ],
  };
};

const evidenceKey = (evidence: RecallEvidence): string =>
  [
    evidence.channel,
    evidence.matchedText ?? "",
    evidence.matchedVariantText ?? "",
    evidence.matchedVariantType ?? "",
    evidence.note ?? "",
  ].join("\0");

export const getCandidateRecallCandidates = <
  TCandidate extends RecallCandidate,
>(
  result: CandidateRecallResult<TCandidate>,
  keyOf: (candidate: TCandidate) => string,
): TCandidate[] => {
  const merged = new Map<string, TCandidate>();
  for (const channel of result.requestedChannels) {
    const outcome = result.outcomes[channel];
    if (outcome.status !== "SUCCEEDED") continue;
    for (const candidate of outcome.candidates) {
      const key = keyOf(candidate);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...candidate, evidences: [...candidate.evidences] });
        continue;
      }
      const preferred =
        candidate.confidence > existing.confidence ? candidate : existing;
      const evidences = [...existing.evidences];
      const seen = new Set(evidences.map(evidenceKey));
      for (const evidence of candidate.evidences) {
        const key = evidenceKey(evidence);
        if (seen.has(key)) continue;
        seen.add(key);
        evidences.push(evidence);
      }
      merged.set(keyOf(preferred), { ...preferred, evidences });
    }
  }
  return [...merged.values()].sort(
    (left, right) => right.confidence - left.confidence,
  );
};

type FailureDefinition = Pick<
  OperationFailureInput,
  "code" | "blocker" | "capability" | "severity" | "redactionBoundary"
>;

const failureDefinitions = {
  LANGUAGE_ANALYSIS_UNAVAILABLE: {
    code: "CAT_OPERATION_MISSING_CAPABILITY",
    blocker: "language_analysis_unavailable",
    capability: "LANGUAGE_ANALYSIS",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  RECALL_DERIVATION_PENDING: {
    code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
    blocker: "recall_derivation_pending",
    capability: "RECALL_DERIVATION",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  RECALL_DERIVATION_BLOCKED: {
    code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
    blocker: "recall_derivation_blocked",
    capability: "RECALL_DERIVATION",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  RECALL_DERIVATION_FAILED: {
    code: "CAT_OPERATION_FAILED",
    blocker: "recall_derivation_failed",
    capability: "RECALL_DERIVATION",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  RECALL_DERIVATION_STALE: {
    code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
    blocker: "recall_derivation_stale",
    capability: "RECALL_DERIVATION",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  CAPABILITY_UNAVAILABLE: {
    code: "CAT_OPERATION_MISSING_CAPABILITY",
    blocker: "candidate_channel_capability_unavailable",
    capability: "CANDIDATE_RECALL",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  CHANNEL_EXECUTION_FAILED: {
    code: "CAT_OPERATION_FAILED",
    blocker: "candidate_channel_execution_failed",
    capability: "CANDIDATE_RECALL",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
} as const satisfies Record<
  CandidateChannelBlocker["reason"],
  FailureDefinition
>;

const failurePriority: CandidateChannelBlocker["reason"][] = [
  "CHANNEL_EXECUTION_FAILED",
  "RECALL_DERIVATION_FAILED",
  "RECALL_DERIVATION_STALE",
  "RECALL_DERIVATION_BLOCKED",
  "RECALL_DERIVATION_PENDING",
  "LANGUAGE_ANALYSIS_UNAVAILABLE",
  "CAPABILITY_UNAVAILABLE",
];

export const mapRecallOperationFailure = <TCandidate>(
  result: CandidateRecallResult<TCandidate>,
  affectedResources: TaskAffectedResource[],
): OperationFailureInput | undefined => {
  const requestedOutcomes = result.requestedChannels
    .map((channel) => result.outcomes[channel])
    .filter((outcome) => outcome.status !== "SKIPPED");
  if (
    requestedOutcomes.length === 0 ||
    requestedOutcomes.some((outcome) => outcome.status !== "BLOCKED")
  ) {
    return undefined;
  }
  const blockers = requestedOutcomes.map((outcome) => {
    if (outcome.status !== "BLOCKED") throw new TypeError("unreachable");
    return outcome.blocker;
  });
  const selectedReason = failurePriority.find((reason) =>
    blockers.some((blocker) => blocker.reason === reason),
  );
  if (!selectedReason)
    throw new TypeError("Missing Candidate Channel blocker.");
  const definition = failureDefinitions[selectedReason];
  const selectedBlocker = blockers.find(
    (blocker) => blocker.reason === selectedReason,
  );
  if (!selectedBlocker)
    throw new TypeError("Missing Candidate Channel blocker.");
  const capability =
    selectedBlocker.capability === "DATABASE"
      ? "CANDIDATE_RECALL"
      : selectedBlocker.capability;
  return {
    ...definition,
    capability,
    message: "All requested Candidate Channels are blocked.",
    retryable: blockers.every((blocker) => blocker.retryable),
    affectedResources,
    remediationHint: "Resolve the reported recall dependencies, then retry.",
  };
};

export class RecallOperationFailureError extends Error {
  public readonly failure: OperationFailureInput;
  public readonly operationFailure: OperationFailureInput;
  public readonly recallResult: CandidateRecallResult<unknown>;

  public constructor(
    failure: OperationFailureInput,
    recallResult: CandidateRecallResult<unknown>,
    options?: ErrorOptions,
  ) {
    super(failure.message, options);
    this.name = "RecallOperationFailureError";
    this.failure = failure;
    this.operationFailure = failure;
    this.recallResult = recallResult;
  }
}

export const assertRecallOperationAvailable = <TCandidate>(
  result: CandidateRecallResult<TCandidate>,
  affectedResources: TaskAffectedResource[] = [],
): void => {
  const failure = mapRecallOperationFailure(result, affectedResources);
  if (failure) throw new RecallOperationFailureError(failure, result);
};
