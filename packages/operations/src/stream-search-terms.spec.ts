import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectTermRecallOp: vi.fn(),
}));

vi.mock("./collect-term-recall.ts", async () => {
  const actual = await vi.importActual<
    typeof import("./collect-term-recall.ts")
  >("./collect-term-recall.ts");
  return { ...actual, collectTermRecallOp: mocks.collectTermRecallOp };
});

import {
  StreamSearchTermsInputSchema,
  streamSearchTermsOp,
} from "./stream-search-terms.ts";

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
};

describe("streamSearchTermsOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects the removed pre-normalized legacy input", () => {
    expect(
      StreamSearchTermsInputSchema.safeParse({
        glossaryIds: [],
        text: "memory bank",
        normalizedText: "memory bank",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
      }).success,
    ).toBe(false);
  });

  it("filters by confidence after collecting fused recall results", async () => {
    const candidates = [
      {
        term: "memory bank",
        translation: "记忆库",
        confidence: 0.9,
        definition: null,
        conceptId: 1,
        glossaryId: "11111111-1111-4111-8111-111111111111",
        evidences: [{ channel: "morphological", confidence: 0.9 }],
      },
      {
        term: "bank memory",
        translation: "银行内存",
        confidence: 0.4,
        definition: null,
        conceptId: 2,
        glossaryId: "11111111-1111-4111-8111-111111111111",
        evidences: [{ channel: "lexical", confidence: 0.4 }],
      },
    ];
    mocks.collectTermRecallOp.mockResolvedValue({
      requestedChannels: ["FUZZY", "VARIANT"],
      outcomes: {
        EXACT: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        FUZZY: { status: "SUCCEEDED", candidates: [candidates[1]!] },
        KEYWORD: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        VARIANT: { status: "SUCCEEDED", candidates: [candidates[0]!] },
        SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
      },
    });

    const results = await collect(
      streamSearchTermsOp({
        glossaryIds: ["11111111-1111-4111-8111-111111111111"],
        text: "memory bank",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        minConfidence: 0.6,
      }),
    );

    expect(mocks.collectTermRecallOp).toHaveBeenCalledWith(
      {
        glossaryIds: ["11111111-1111-4111-8111-111111111111"],
        text: "memory bank",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        minSemanticSimilarity: 0.6,
        maxAmount: 20,
      },
      undefined,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      type: "CANDIDATE",
      candidate: { conceptId: 1 },
    });
    expect(results[1]).toMatchObject({ type: "COMPLETED" });
  });
});
