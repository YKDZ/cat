import type { ScopedRecallDerivationStateView } from "@cat/domain";
import type {
  CandidateChannelBlocker,
  RecallDerivationReference,
  RecallDerivationVersion,
} from "@cat/shared";
import { RecallDerivationReferenceSchema } from "@cat/shared";

export type ScopedRecallDerivationAssessment =
  | { status: "NO_SCOPED_ASSETS" }
  | { status: "FRESH" }
  | { status: "BLOCKED"; blocker: CandidateChannelBlocker };

const toReference = (
  row: ScopedRecallDerivationStateView,
  targetKind: RecallDerivationReference["targetKind"],
): RecallDerivationReference => {
  if (row.demandRevision === null) {
    throw new TypeError("Recall Derivation reference is missing its revision.");
  }
  return RecallDerivationReferenceSchema.parse({
    targetKind,
    targetId: row.targetId,
    languageId: row.languageId,
    demandRevision: row.demandRevision,
  });
};

const toTarget = (
  row: ScopedRecallDerivationStateView,
  targetKind: RecallDerivationReference["targetKind"],
) => ({ targetKind, targetId: row.targetId, languageId: row.languageId });

export const assessScopedRecallDerivation = (
  rows: ScopedRecallDerivationStateView[],
  targetKind: RecallDerivationReference["targetKind"],
  requiredDerivationVersion: RecallDerivationVersion,
): ScopedRecallDerivationAssessment => {
  if (rows.length === 0) return { status: "NO_SCOPED_ASSETS" };

  const classify = (row: ScopedRecallDerivationStateView) => {
    if (row.stateId === null || row.status === null) return "PENDING" as const;
    if (row.status === "FAILED") return "FAILED" as const;
    if (row.status === "BLOCKED") return "BLOCKED" as const;
    if (row.status === "PENDING" || row.status === "RUNNING") {
      return "PENDING" as const;
    }
    if (
      row.requiredDerivationVersion !== requiredDerivationVersion ||
      row.currentDerivationVersion !== requiredDerivationVersion ||
      row.currentCanonicalInputVersion !== row.canonicalInputVersion
    ) {
      return "STALE" as const;
    }
    return "FRESH" as const;
  };

  const classified = rows.map((row) => ({ row, status: classify(row) }));
  const selectedStatus = (
    ["FAILED", "BLOCKED", "STALE", "PENDING"] as const
  ).find((status) => classified.some((entry) => entry.status === status));
  if (!selectedStatus) return { status: "FRESH" };

  const affected = classified
    .filter((entry) => entry.status === selectedStatus)
    .map((entry) => entry.row);
  const affectedReferences = affected
    .map((row) =>
      row.stateId !== null && row.demandRevision !== null
        ? toReference(row, targetKind)
        : undefined,
    )
    .filter((reference) => reference !== undefined);
  const affectedTargets = affected.map((row) => toTarget(row, targetKind));
  const representative = affected[0];
  if (!representative) {
    throw new TypeError("Missing affected Recall Derivation state.");
  }
  if (selectedStatus === "STALE") {
    if (representative.canonicalInputVersion === null) {
      throw new TypeError(
        "Stale Recall Derivation state is missing its canonical version.",
      );
    }
    return {
      status: "BLOCKED",
      blocker: {
        reason: "RECALL_DERIVATION_STALE",
        message: "Scoped Recall Derivation is stale.",
        retryable: true,
        capability: "RECALL_DERIVATION",
        affectedTargets,
        affectedReferences,
        requiredCanonicalInputVersion: representative.canonicalInputVersion,
        currentCanonicalInputVersion:
          representative.currentCanonicalInputVersion,
        requiredDerivationVersion,
        currentDerivationVersion: representative.currentDerivationVersion,
      },
    };
  }

  const reason = {
    PENDING: "RECALL_DERIVATION_PENDING",
    BLOCKED: "RECALL_DERIVATION_BLOCKED",
    FAILED: "RECALL_DERIVATION_FAILED",
  } as const;
  return {
    status: "BLOCKED",
    blocker: {
      reason: reason[selectedStatus],
      message: `Scoped Recall Derivation is ${selectedStatus.toLowerCase()}.`,
      retryable:
        selectedStatus === "PENDING" ||
        affected.some((row) => row.blocker?.retryable === true),
      capability: "RECALL_DERIVATION",
      affectedTargets,
      ...(affectedReferences.length > 0 ? { affectedReferences } : {}),
      requiredDerivationVersion,
      currentDerivationVersion: representative.currentDerivationVersion,
    },
  };
};
