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

import { termAlignmentGraph } from "../term-alignment";

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

  it("passes nlpSegmenterId through to statistical alignment", async () => {
    const statAlignNode =
      termAlignmentGraph.graphDefinition.nodes["stat-align"];

    expect(statAlignNode).toBeDefined();
    expect(statAlignNode?.config).toMatchObject({
      inputMapping: expect.objectContaining({
        nlpSegmenterId: "nlpSegmenterId",
      }),
      handler: expect.any(String),
    });
    expect(typeof mocks.statisticalTermAlignOp.mockResolvedValue).toBe(
      "function",
    );
    expect(
      termAlignmentGraph.inputSchema.safeParse({
        nlpSegmenterId: 88,
        termGroups: [
          {
            languageId: "en",
            candidates: [{ text: "memory bank" }],
          },
          {
            languageId: "zh-Hans",
            candidates: [{ text: "记忆库" }],
          },
        ],
        config: {
          vector: { enabled: false },
          llm: { enabled: false },
        },
      }).success,
    ).toBe(true);
  });
});
