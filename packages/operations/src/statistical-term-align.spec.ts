import { executeQuery } from "@cat/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { languageAnalyzeBatchOp } from "./language-analyze-batch.ts";
import { statisticalTermAlignOp } from "./statistical-term-align.ts";

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return {
    ...actual,
    executeQuery: vi.fn(),
  };
});

vi.mock("./language-analyze-batch.ts", () => ({
  languageAnalyzeBatchOp: vi.fn(),
}));

const mockedExecuteQuery = vi.mocked(executeQuery);
const mockedLanguageAnalyzeBatchOp = vi.mocked(languageAnalyzeBatchOp);
const db = {} as never;

describe("statisticalTermAlignOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses token surfaces when Language Analysis omits lemmas", async () => {
    mockedExecuteQuery.mockResolvedValue([{ id: 73, text: "running" }]);
    mockedLanguageAnalyzeBatchOp.mockResolvedValue({
      results: [
        {
          id: "73",
          result: {
            tokens: [
              {
                text: "running",
                lemma: "",
                pos: "VERB",
                start: 0,
                end: 7,
                isStop: false,
                isPunct: false,
              },
            ],
          },
        },
      ],
    } as never);

    await expect(
      statisticalTermAlignOp(
        {
          termGroups: [
            {
              languageId: "en",
              candidates: [
                {
                  text: "running",
                  occurrences: [{ elementId: 1, ranges: [] }],
                },
              ],
            },
            {
              languageId: "zh-Hans",
              candidates: [
                {
                  text: "运行",
                  occurrences: [
                    { elementId: 2, translationId: 73, ranges: [] },
                  ],
                },
              ],
            },
          ],
          config: { minCoOccurrence: 1 },
        },
        { db, traceId: "statistical-term-align" },
      ),
    ).resolves.toEqual({
      alignedPairs: [
        {
          groupAIndex: 0,
          candidateAIndex: 0,
          groupBIndex: 1,
          candidateBIndex: 0,
          coOccurrenceScore: 1,
        },
      ],
    });
  });
});
