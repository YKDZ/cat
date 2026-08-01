import {
  LanguageAnalysisOperationFailureError,
  LanguageAnalysisPolicyChangedError,
} from "@cat/operations";
import { describe, expect, it } from "vitest";

import { exposeLanguageAnalysisOperationFailure } from "../language-analyze.ts";

describe("language analysis workflow failures", () => {
  it("exposes a mapped typed failure without persisting it", () => {
    try {
      exposeLanguageAnalysisOperationFailure(
        new LanguageAnalysisPolicyChangedError(new Error("revision changed")),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(LanguageAnalysisOperationFailureError);
      expect(error).toMatchObject({
        failure: {
          blocker: "language_analysis_policy_changed",
          affectedResources: [],
        },
        operationFailure: {
          blocker: "language_analysis_policy_changed",
        },
      });
    }
  });
});
