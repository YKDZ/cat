import {
  LanguageAnalysisBlockerPolicy,
  LanguageAnalysisBlockerReasonValues,
  LanguageAnalysisRequirementAssessmentSchema,
  OperationFailureInputSchema,
  type LanguageAnalysisBlockerReason,
} from "@cat/shared";
import { describe, expect, it } from "vitest";

import {
  LanguageAnalysisOperationFailureError,
  mapLanguageAnalysisOperationFailure,
} from "./language-analysis-operation-failure.ts";
import {
  LanguageAnalysisPolicyChangedError,
  LanguageAnalysisRequirementError,
} from "./language-analysis-requirement.ts";

const resources = [
  { type: "PROJECT" as const, id: "11111111-1111-4111-8111-111111111111" },
  { type: "ELEMENT" as const, id: "42" },
];

const requirementError = (reason: LanguageAnalysisBlockerReason) =>
  new LanguageAnalysisRequirementError(
    LanguageAnalysisRequirementAssessmentSchema.parse({
      status: "BLOCKED",
      languageId: "en",
      policyEpoch: 3,
      selection: null,
      blocker: {
        reason,
        ...LanguageAnalysisBlockerPolicy[reason],
        languageId: "en",
        implementation: null,
        observedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      assessedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  );

describe("mapLanguageAnalysisOperationFailure", () => {
  it.each(LanguageAnalysisBlockerReasonValues)(
    "maps %s using its closed blocker policy",
    (reason) => {
      const failure = mapLanguageAnalysisOperationFailure(
        requirementError(reason),
        resources,
      );

      expect(failure).toMatchObject({
        blocker: `language_analysis_${reason.toLowerCase()}`,
        capability: "LANGUAGE_ANALYSIS",
        affectedResources: resources,
        retryable: LanguageAnalysisBlockerPolicy[reason].retryable,
        redactionBoundary: "PUBLIC",
      });
      expect(OperationFailureInputSchema.parse(failure)).toEqual(failure);
    },
  );

  it("maps unavailable dependencies as retryable dependency failures", () => {
    expect(
      mapLanguageAnalysisOperationFailure(
        requirementError("UNAVAILABLE"),
        resources,
      ),
    ).toMatchObject({
      code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
      retryable: true,
      remediationHint:
        "Retry after the language analysis service is available.",
    });
    expect(
      mapLanguageAnalysisOperationFailure(
        requirementError("TIMEOUT"),
        resources,
      ),
    ).toMatchObject({
      code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
      retryable: true,
    });
  });

  it("maps invalid analyzer output as non-retryable failures", () => {
    for (const reason of ["INVALID_RESPONSE", "INVALID_ATTESTATION"] as const) {
      expect(
        mapLanguageAnalysisOperationFailure(
          requirementError(reason),
          resources,
        ),
      ).toMatchObject({ code: "CAT_OPERATION_FAILED", retryable: false });
    }
  });

  it("maps a changed policy without exposing its cause", () => {
    const failure = mapLanguageAnalysisOperationFailure(
      new LanguageAnalysisPolicyChangedError(
        new Error("plugin id and selection revision"),
      ),
      resources,
    );

    expect(failure).toMatchObject({
      code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
      blocker: "language_analysis_policy_changed",
      capability: "LANGUAGE_ANALYSIS",
      retryable: true,
      affectedResources: resources,
      redactionBoundary: "PUBLIC",
    });
    expect(failure?.message).not.toContain("plugin id");
  });

  it("does not convert unrelated errors", () => {
    expect(
      mapLanguageAnalysisOperationFailure(new Error("other"), resources),
    ).toBeUndefined();
  });

  it("keeps the scheduler-facing failure identity on the typed error", () => {
    const failure = mapLanguageAnalysisOperationFailure(
      new LanguageAnalysisPolicyChangedError(new Error("revision changed")),
      resources,
    );
    if (failure === undefined) throw new Error("Expected mapped failure.");

    const error = new LanguageAnalysisOperationFailureError(failure);
    expect(error.operationFailure).toBe(error.failure);
  });
});
