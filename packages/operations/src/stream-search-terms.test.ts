import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectTermRecallOp: vi.fn(),
}));

vi.mock("./collect-term-recall", () => ({
  collectTermRecallOp: mocks.collectTermRecallOp,
}));

import { streamSearchTermsOp } from "./stream-search-terms";

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

  it("filters by confidence after collecting fused recall results", async () => {
    mocks.collectTermRecallOp.mockResolvedValue([
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
    ]);

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
    expect(results).toHaveLength(1);
    expect(results[0]?.conceptId).toBe(1);
  });
});
