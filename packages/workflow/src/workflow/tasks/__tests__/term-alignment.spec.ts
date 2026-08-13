import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  llmTermAlignOp: vi.fn(),
  mergeAlignmentOp: vi.fn(),
  statisticalTermAlignOp: vi.fn(),
  vectorTermAlignOp: vi.fn(),
}));

vi.mock("@cat/operations", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/operations")>("@cat/operations");

  return {
    ...actual,
    llmTermAlignOp: mocks.llmTermAlignOp,
    mergeAlignmentOp: mocks.mergeAlignmentOp,
    statisticalTermAlignOp: mocks.statisticalTermAlignOp,
    vectorTermAlignOp: mocks.vectorTermAlignOp,
  };
});

import { termAlignmentGraph } from "../term-alignment.ts";

describe("termAlignmentGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.vectorTermAlignOp.mockResolvedValue({
      alignedPairs: [],
      stringIds: {},
    });
    mocks.statisticalTermAlignOp.mockResolvedValue({
      alignedPairs: [],
    });
    mocks.mergeAlignmentOp.mockResolvedValue({
      alignedGroups: [],
      unaligned: [],
      stats: {
        totalInputTerms: 2,
        totalAlignedGroups: 0,
        vectorAlignments: 0,
        statisticalAlignments: 0,
        llmAlignments: 0,
      },
    });
  });

  it("does not expose a per-call Language Analyzer override", () => {
    expect("languageAnalyzer" in termAlignmentGraph.inputSchema.shape).toBe(
      false,
    );
  });
});
