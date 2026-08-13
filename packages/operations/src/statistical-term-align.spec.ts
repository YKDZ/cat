import { executeQuery } from "@cat/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { languageAnalyzeBatchOp } from "./language-analyze-batch.ts";
import {
  StatisticalTermAlignInputSchema,
  statisticalTermAlignOp,
} from "./statistical-term-align.ts";

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
const fallbackInput = () =>
  StatisticalTermAlignInputSchema.parse({
    termGroups: [
      {
        languageId: "en",
        candidates: [
          {
            text: "open",
            occurrences: [{ elementId: 1, ranges: [] }],
          },
        ],
      },
      {
        languageId: "fr",
        candidates: [
          {
            text: "ouvrir",
            occurrences: [{ elementId: 1, ranges: [] }],
          },
        ],
      },
    ],
    config: { minCoOccurrence: 1 },
  });

const fallbackAlignment = {
  alignedPairs: [
    {
      groupAIndex: 0,
      candidateAIndex: 0,
      groupBIndex: 1,
      candidateBIndex: 0,
      coOccurrenceScore: 1,
    },
  ],
};

describe("statisticalTermAlignOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates Language Analysis failures instead of weakening alignment to element co-occurrence", async () => {
    mockedExecuteQuery.mockResolvedValue([{ id: 73, text: "running" }]);
    const failure = new Error("Language Analysis attestation is invalid");
    mockedLanguageAnalyzeBatchOp.mockRejectedValue(failure);

    await expect(
      statisticalTermAlignOp(
        StatisticalTermAlignInputSchema.parse({
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
        }),
        { db, traceId: "statistical-term-align" },
      ),
    ).rejects.toBe(failure);
  });

  it("uses element co-occurrence when an element has no translations", async () => {
    mockedExecuteQuery.mockResolvedValue([]);

    await expect(
      statisticalTermAlignOp(fallbackInput(), {
        db,
        traceId: "statistical-term-align",
      }),
    ).resolves.toEqual(fallbackAlignment);
    expect(mockedLanguageAnalyzeBatchOp).not.toHaveBeenCalled();
  });

  it("uses element co-occurrence when analysis returns no matches", async () => {
    mockedExecuteQuery.mockResolvedValue([{ id: 73, text: "unmatched" }]);
    mockedLanguageAnalyzeBatchOp.mockResolvedValue({ results: [] } as never);

    await expect(
      statisticalTermAlignOp(fallbackInput(), {
        db,
        traceId: "statistical-term-align",
      }),
    ).resolves.toEqual(fallbackAlignment);
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
        StatisticalTermAlignInputSchema.parse({
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
        }),
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
