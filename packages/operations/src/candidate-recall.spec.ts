import type { CandidateRecallResult } from "@cat/shared";
import {
  CandidateChannelBlockerSchema,
  OperationFailureInputSchema,
} from "@cat/shared";
import { describe, expect, it } from "vitest";

import {
  assertRecallOperationAvailable,
  getCandidateRecallCandidates,
  mapRecallOperationFailure,
  RecallOperationFailureError,
} from "./candidate-recall.ts";

type Candidate = {
  id: number;
  confidence: number;
  evidences: Array<{ channel: "exact"; confidence: number }>;
};

const blocker = CandidateChannelBlockerSchema.parse({
  reason: "RECALL_DERIVATION_PENDING",
  message: "Recall Derivation is pending.",
  retryable: true,
  capability: "RECALL_DERIVATION",
  affectedTargets: [
    {
      targetKind: "MEMORY_ITEM",
      targetId: "42",
      languageId: "en",
    },
  ],
  affectedReferences: [
    {
      targetKind: "MEMORY_ITEM",
      targetId: "42",
      languageId: "en",
      demandRevision: 1,
    },
  ],
  requiredDerivationVersion: `sha256:${"a".repeat(64)}`,
});

const skipped = {
  status: "SKIPPED" as const,
  reason: "NOT_REQUESTED" as const,
};

const result = (
  requestedChannels: CandidateRecallResult<Candidate>["requestedChannels"],
  exact: CandidateRecallResult<Candidate>["outcomes"]["EXACT"],
  keyword: CandidateRecallResult<Candidate>["outcomes"]["KEYWORD"],
): CandidateRecallResult<Candidate> => ({
  requestedChannels,
  outcomes: {
    EXACT: exact,
    FUZZY: skipped,
    KEYWORD: keyword,
    VARIANT: skipped,
    SEMANTIC: skipped,
  },
});

describe("Candidate Recall composite", () => {
  it("keeps a partial blocker alongside successful candidates", () => {
    const composite = result(
      ["EXACT", "KEYWORD"],
      {
        status: "SUCCEEDED",
        candidates: [
          {
            id: 1,
            confidence: 1,
            evidences: [{ channel: "exact", confidence: 1 }],
          },
        ],
      },
      { status: "BLOCKED", blocker },
    );
    expect(mapRecallOperationFailure(composite, [])).toBeUndefined();
    expect(
      getCandidateRecallCandidates(composite, (entry) => `${entry.id}`),
    ).toHaveLength(1);
  });

  it.each([
    { requestedChannels: ["KEYWORD"] as const },
    { requestedChannels: ["EXACT", "KEYWORD"] as const },
  ])(
    "projects all-blocked requested channels %j to Operation Failure",
    ({ requestedChannels }) => {
      const composite = result(
        [...requestedChannels],
        (requestedChannels as readonly string[]).includes("EXACT")
          ? { status: "BLOCKED", blocker }
          : skipped,
        { status: "BLOCKED", blocker },
      );
      const failure = mapRecallOperationFailure(composite, []);
      expect(OperationFailureInputSchema.parse(failure)).toMatchObject({
        blocker: "recall_derivation_pending",
        capability: "RECALL_DERIVATION",
        retryable: true,
      });
      try {
        assertRecallOperationAvailable(composite);
        expect.unreachable("Expected recall failure.");
      } catch (error) {
        expect(error).toBeInstanceOf(RecallOperationFailureError);
        expect((error as RecallOperationFailureError).recallResult).toBe(
          composite,
        );
      }
    },
  );

  it("does not project a legal empty result as failure", () => {
    const composite = result(["EXACT"], { status: "EMPTY" }, skipped);
    expect(mapRecallOperationFailure(composite, [])).toBeUndefined();
    expect(
      getCandidateRecallCandidates(composite, (entry) => `${entry.id}`),
    ).toEqual([]);
  });

  it("ignores not-applicable channels when every active channel is blocked", () => {
    const composite = result(
      ["EXACT", "KEYWORD"],
      { status: "SKIPPED", reason: "NOT_APPLICABLE" },
      { status: "BLOCKED", blocker },
    );
    expect(mapRecallOperationFailure(composite, [])).toMatchObject({
      blocker: "recall_derivation_pending",
    });
  });
});
