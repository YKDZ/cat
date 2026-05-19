import {
  type NormalizedQaFinding,
  QaReviewProfileConfigSchema,
} from "@cat/shared";
import { describe, expect, it } from "vitest";

import { applyQaReviewPolicy } from "./policy";

const baseFinding = (
  overrides: Partial<NormalizedQaFinding> = {},
): NormalizedQaFinding => ({
  layer: "DETERMINISTIC",
  checkerServiceId: 1,
  qaResultItemId: 1,
  ruleId: "rule.base",
  ruleFamily: "generic",
  severity: "warning",
  action: "NEEDS_REVIEW",
  disposition: "OPEN",
  confidenceBasisPoints: 10000,
  riskScore: 45,
  message: "Base finding",
  explanation: null,
  sourceSpan: null,
  targetSpan: null,
  suggestedText: null,
  meta: null,
  ...overrides,
});

const profile = QaReviewProfileConfigSchema.parse({
  rules: [
    {
      ruleFamily: "placeholder",
      action: "BLOCK_APPROVAL",
      riskScore: 100,
      minConfidenceBasisPoints: 9000,
    },
    {
      ruleFamily: "number",
      action: "NEEDS_REVIEW",
      riskScore: 65,
      minConfidenceBasisPoints: 0,
    },
  ],
});

describe("applyQaReviewPolicy", () => {
  it("maps placeholder findings to blocking review", () => {
    const [finding] = applyQaReviewPolicy({
      findings: [baseFinding({ ruleFamily: "placeholder", action: "PASS" })],
      profile,
    });

    expect(finding.action).toBe("BLOCK_APPROVAL");
    expect(finding.riskScore).toBe(100);
  });

  it("keeps number findings in manual review lane", () => {
    const [finding] = applyQaReviewPolicy({
      findings: [baseFinding({ ruleFamily: "number", riskScore: 10 })],
      profile,
    });

    expect(finding.action).toBe("NEEDS_REVIEW");
    expect(finding.riskScore).toBe(65);
  });

  it("downgrades low-confidence matched findings to informational", () => {
    const [finding] = applyQaReviewPolicy({
      findings: [
        baseFinding({
          ruleFamily: "placeholder",
          confidenceBasisPoints: 1000,
          riskScore: 70,
        }),
      ],
      profile,
    });

    expect(finding.action).toBe("INFORMATIONAL");
    expect(finding.riskScore).toBe(20);
  });

  it("preserves pass findings with zero risk when no rule matches", () => {
    const [finding] = applyQaReviewPolicy({
      findings: [baseFinding({ action: "PASS", riskScore: 0 })],
      profile,
    });

    expect(finding.action).toBe("PASS");
    expect(finding.riskScore).toBe(0);
  });
});
