import { describe, expect, it } from "vitest";

import {
  CreateQaReviewAnnotationInputSchema,
  NormalizedQaFindingSchema,
  QaReviewNotificationDataSchema,
  QaReviewProfileConfigSchema,
  QaReviewTextRangeSchema,
  SubmitQaReviewDecisionInputSchema,
} from "../qa-review.ts";

describe("qa review schemas", () => {
  it("normalizes the default profile to deterministic-only review", () => {
    const profile = QaReviewProfileConfigSchema.parse({});

    expect(profile.enabledLayers).toEqual({
      deterministic: true,
      semantic: false,
    });
    expect(profile.llm.minRiskScoreForQueue).toBe(40);
  });

  it("accepts a normalized blocking placeholder finding", () => {
    const finding = NormalizedQaFindingSchema.parse({
      layer: "DETERMINISTIC",
      ruleId: "basic.variable-consistency",
      ruleFamily: "placeholder",
      severity: "error",
      action: "BLOCK_APPROVAL",
      confidenceBasisPoints: 10000,
      riskScore: 100,
      message: "译文中缺失变量 {name}",
    });

    expect(finding.disposition).toBe("OPEN");
    expect(finding.sourceSpan).toBeNull();
  });

  it("distinguishes QA notifications with typed data while using category QA", () => {
    const data = QaReviewNotificationDataSchema.parse({
      reviewEventType: "PRAISE_RECEIVED",
      projectId: "11111111-1111-4111-8111-111111111111",
      annotationId: 1,
    });

    expect(data.reviewEventType).toBe("PRAISE_RECEIVED");
  });

  it("requires reasons for final review decisions", () => {
    expect(() =>
      SubmitQaReviewDecisionInputSchema.parse({
        queueItemId: 1,
        decision: "REQUEST_CHANGES",
        reason: "",
        expectedVersion: 1,
      }),
    ).toThrow();
  });

  it("defaults new annotations to non-promotable unless explicitly requested", () => {
    const annotation = CreateQaReviewAnnotationInputSchema.parse({
      queueItemId: 1,
      intent: "NOTE",
      body: "上下文说明",
    });

    expect(annotation.isPromotable).toBe(false);
  });

  it("rejects reversed text ranges", () => {
    expect(
      QaReviewTextRangeSchema.safeParse({ start: 5, end: 2 }).success,
    ).toBe(false);
  });
});
