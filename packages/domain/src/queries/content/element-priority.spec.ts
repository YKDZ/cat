import { describe, expect, it } from "vitest";

import type { PriorityRankableEditorElement } from "./element-priority";

import {
  buildElementPriorityPlan,
  MAX_REUSE_FIRST_SCOPE_ROWS,
  orderRowsByPriorityPlan,
} from "./element-priority";

const baseRow = (
  id: number,
  value: string,
  position: number,
  primaryContentNodeId = "11111111-1111-4111-8111-111111111111",
): PriorityRankableEditorElement => ({
  id,
  projectId: "22222222-2222-4222-8222-222222222222",
  importerId: "test-json",
  sourceRootRef: "root",
  sourceNodeRef: "file.json",
  stableSourceRef: `stable-${id}`,
  identityStatus: "ACTIVE",
  identityConfidence: 10000,
  meta: null,
  sourceStartLine: null,
  sourceEndLine: null,
  sourceLocationMeta: null,
  creatorId: "33333333-3333-4333-8333-333333333333",
  vectorizedStringId: id,
  approvedTranslationId: null,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  value,
  languageId: "en",
  status: "NO",
  primaryContentNodeId,
  primaryContentNodeLabel: "file.json",
  primaryContentNodeKind: "FILE",
  contentNodePath: [
    { id: primaryContentNodeId, label: "file.json", kind: "FILE" },
  ],
  localOrder: position,
  contentNodeSortKey: "0000000000:file.json",
  position,
});

describe("buildElementPriorityPlan", () => {
  it("keeps structural order for structure mode", () => {
    const rows = [
      baseRow(1, "Long sentence with checkout button", 0),
      baseRow(2, "Checkout", 1),
    ];
    const plan = buildElementPriorityPlan(rows, "structure");

    expect(plan.items.map((item) => item.id)).toEqual([1, 2]);
    expect(orderRowsByPriorityPlan(rows, plan).map((row) => row.id)).toEqual([
      1, 2,
    ]);
  });

  it("promotes short reusable seeds before longer consumers", () => {
    const rows = [
      baseRow(1, "Click the checkout button to continue", 0),
      baseRow(2, "Checkout", 1),
      baseRow(3, "Checkout complete", 2),
    ];
    const plan = buildElementPriorityPlan(rows, "reuse-first");
    const ordered = orderRowsByPriorityPlan(rows, plan);

    expect(ordered[0]?.id).toBe(2);
    expect(ordered[0]?.priority?.reasonCodes).toContain("REUSE_SEED");
  });

  it("does not compute neighbor continuity across primary content nodes", () => {
    const fileA = "11111111-1111-4111-8111-111111111111";
    const fileB = "44444444-4444-4444-8444-444444444444";
    const rows = [
      baseRow(1, "Save profile", 0, fileA),
      baseRow(2, "Save changes", 1, fileB),
    ];
    const plan = buildElementPriorityPlan(rows, "reuse-first");

    expect(plan.summaryById.get(1)?.reasonCodes).not.toContain(
      "NEIGHBOR_CONTEXT",
    );
    expect(plan.summaryById.get(2)?.reasonCodes).not.toContain(
      "NEIGHBOR_CONTEXT",
    );
  });

  it("falls back to structural order for oversized scopes", () => {
    const rows = Array.from(
      { length: MAX_REUSE_FIRST_SCOPE_ROWS + 1 },
      (_, index) => baseRow(index + 1, `Text ${index + 1}`, index),
    );
    const plan = buildElementPriorityPlan(rows, "reuse-first");

    expect(plan.fallbackReason).toBe("STRUCTURE_FALLBACK");
    expect(plan.items.slice(0, 3).map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("uses deterministic structural tie-breaks for CJK text", () => {
    const rows = [
      baseRow(1, "保存", 0),
      baseRow(2, "取消", 1),
      baseRow(3, "帮助", 2),
    ];
    const plan = buildElementPriorityPlan(rows, "reuse-first");

    expect(new Set(plan.items.map((item) => item.id))).toEqual(
      new Set([1, 2, 3]),
    );
    expect(plan.items.every((item) => item.summary.confidence >= 0.25)).toBe(
      true,
    );
  });

  it("falls back to regex tokenization for invalid language ids", () => {
    const rows = [
      { ...baseRow(1, "Checkout", 0), languageId: "not a language" },
      {
        ...baseRow(2, "Checkout complete", 1),
        languageId: "not a language",
      },
    ];

    expect(() => buildElementPriorityPlan(rows, "reuse-first")).not.toThrow();
    expect(buildElementPriorityPlan(rows, "reuse-first").items[0]?.id).toBe(1);
  });
});
