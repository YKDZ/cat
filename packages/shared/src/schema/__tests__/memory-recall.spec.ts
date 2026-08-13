import { describe, expect, it } from "vitest";
import * as z from "zod";

import { MemoryRecallResultSchema } from "#/schema/memory-recall.ts";
import {
  type CandidateChannelOutcome,
  type CandidateRecallResult,
  CandidateChannelSchema,
  CandidateChannelOutcomeStatusSchema,
  CandidateChannelRequestSchema,
  createCandidateRecallResultSchema,
} from "#/schema/recall.ts";
import {
  TermRecallResultSchema,
  TermRecallStreamEventSchema,
} from "#/schema/term-recall.ts";

const CandidateSchema = z.strictObject({ id: z.int().positive() });
const ResultSchema = createCandidateRecallResultSchema(CandidateSchema);
const evidence = {
  channel: "keyword" as const,
  matchedText: "running",
  confidence: 1,
  note: "analyzer-backed keyword match",
};

describe("Candidate Channel outcomes", () => {
  it("preserves ranking decisions in parsed memory recall results", () => {
    const result = MemoryRecallResultSchema.parse({
      requestedChannels: ["EXACT"],
      outcomes: {
        EXACT: {
          status: "SUCCEEDED",
          candidates: [
            {
              id: 1,
              translationChunkSetId: null,
              source: "Save changes",
              translation: "保存更改",
              memoryId: "11111111-1111-4111-8111-111111111111",
              creatorId: null,
              confidence: 1,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              evidences: [
                {
                  channel: "exact",
                  confidence: 1,
                },
              ],
              rankingDecisions: [
                {
                  action: "promoted",
                  note: "Exact source match.",
                },
              ],
            },
          ],
        },
        FUZZY: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        KEYWORD: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        VARIANT: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
      },
    });

    expect(result.outcomes.EXACT).toMatchObject({
      status: "SUCCEEDED",
      candidates: [
        {
          rankingDecisions: [
            { action: "promoted", note: "Exact source match." },
          ],
        },
      ],
    });
  });

  it("preserves ranked term candidates across the stream wire contract", () => {
    const candidate = {
      term: "memory bank",
      translation: "记忆库",
      definition: null,
      conceptId: 1,
      glossaryId: "11111111-1111-4111-8111-111111111111",
      confidence: 1,
      evidences: [{ channel: "exact", confidence: 1 }],
      rankingDecisions: [
        { action: "promoted", note: "Exact term occurrence." },
      ],
    };
    const result = TermRecallResultSchema.parse({
      requestedChannels: ["EXACT"],
      outcomes: {
        EXACT: { status: "SUCCEEDED", candidates: [candidate] },
        FUZZY: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        KEYWORD: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        VARIANT: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
      },
    });

    expect(
      TermRecallStreamEventSchema.parse({ type: "CANDIDATE", candidate }),
    ).toMatchObject({
      type: "CANDIDATE",
      candidate: { rankingDecisions: candidate.rankingDecisions },
    });
    expect(
      TermRecallStreamEventSchema.parse({ type: "COMPLETED", result }),
    ).toMatchObject({
      type: "COMPLETED",
      result: {
        outcomes: {
          EXACT: {
            candidates: [{ rankingDecisions: candidate.rankingDecisions }],
          },
        },
      },
    });
  });

  it("keeps the runtime result schema and static contract identical", () => {
    type RuntimeResult = z.infer<typeof ResultSchema>;
    type StaticResult = CandidateRecallResult<z.infer<typeof CandidateSchema>>;
    const runtimeMatchesStatic: [RuntimeResult] extends [StaticResult]
      ? true
      : false = true;
    const staticMatchesRuntime: [StaticResult] extends [RuntimeResult]
      ? true
      : false = true;
    expect(runtimeMatchesStatic && staticMatchesRuntime).toBe(true);
  });

  it("closes the static success type over non-empty evidenced candidates", () => {
    const empty: CandidateChannelOutcome<{ id: number }> = {
      status: "SUCCEEDED",
      // @ts-expect-error SUCCEEDED must contain at least one candidate.
      candidates: [],
    };
    const withoutEvidence: CandidateChannelOutcome<{ id: number }> = {
      status: "SUCCEEDED",
      candidates: [
        // @ts-expect-error Every successful candidate must own recall evidence.
        { id: 1 },
      ],
    };
    expect([empty, withoutEvidence]).toHaveLength(2);
  });

  it("requires exactly one typed outcome per closed channel", () => {
    expect(CandidateChannelOutcomeStatusSchema.options).toEqual([
      "SUCCEEDED",
      "EMPTY",
      "BLOCKED",
      "SKIPPED",
    ]);
    expect(
      ResultSchema.parse({
        requestedChannels: ["EXACT", "FUZZY", "KEYWORD", "VARIANT"],
        outcomes: {
          EXACT: { status: "EMPTY" },
          FUZZY: { status: "EMPTY" },
          KEYWORD: {
            status: "SUCCEEDED",
            candidates: [{ id: 1, evidences: [evidence] }],
          },
          VARIANT: {
            status: "BLOCKED",
            blocker: {
              reason: "RECALL_DERIVATION_PENDING",
              message: "Recall Derivation is pending.",
              retryable: true,
              capability: "RECALL_DERIVATION",
              affectedTargets: [
                {
                  targetKind: "MEMORY_ITEM",
                  targetId: "42",
                  languageId: "en",
                },
              ],
              affectedReferences: [
                {
                  targetKind: "MEMORY_ITEM",
                  targetId: "42",
                  languageId: "en",
                  demandRevision: 2,
                },
              ],
              requiredDerivationVersion: `sha256:${"a".repeat(64)}`,
              currentDerivationVersion: `sha256:${"b".repeat(64)}`,
            },
          },
          SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
        },
      }),
    ).toMatchObject({
      outcomes: {
        EXACT: { status: "EMPTY" },
        FUZZY: { status: "EMPTY" },
        KEYWORD: { status: "SUCCEEDED" },
        VARIANT: { status: "BLOCKED" },
        SEMANTIC: { status: "SKIPPED" },
      },
    });

    expect(() =>
      ResultSchema.parse({
        requestedChannels: ["EXACT"],
        outcomes: [
          { channel: "EXACT", status: "EMPTY" },
          { channel: "EXACT", status: "EMPTY" },
        ],
      }),
    ).toThrow();
  });

  it("requires candidate evidence for success and legal empty has no blocker", () => {
    const base = {
      requestedChannels: ["EXACT", "FUZZY", "KEYWORD", "VARIANT"],
      outcomes: {
        EXACT: { status: "EMPTY" },
        FUZZY: { status: "EMPTY" },
        VARIANT: { status: "EMPTY" },
        SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
      },
    };
    expect(() =>
      ResultSchema.parse({
        ...base,
        outcomes: {
          ...base.outcomes,
          KEYWORD: { status: "SUCCEEDED", candidates: [{ id: 1 }] },
        },
      }),
    ).toThrow();
    expect(
      ResultSchema.parse({
        ...base,
        outcomes: { ...base.outcomes, KEYWORD: { status: "EMPTY" } },
      }).outcomes.KEYWORD,
    ).toEqual({ status: "EMPTY" });
  });

  it("enforces requested and unrequested outcome consistency", () => {
    const outcomes = {
      EXACT: { status: "EMPTY" as const },
      FUZZY: { status: "SKIPPED" as const, reason: "NOT_REQUESTED" as const },
      KEYWORD: {
        status: "SKIPPED" as const,
        reason: "NOT_REQUESTED" as const,
      },
      VARIANT: {
        status: "SKIPPED" as const,
        reason: "NOT_REQUESTED" as const,
      },
      SEMANTIC: {
        status: "SKIPPED" as const,
        reason: "NOT_REQUESTED" as const,
      },
    };
    expect(
      ResultSchema.parse({ requestedChannels: ["EXACT"], outcomes }),
    ).toEqual({ requestedChannels: ["EXACT"], outcomes });
    expect(() =>
      ResultSchema.parse({
        requestedChannels: ["EXACT", "FUZZY"],
        outcomes,
      }),
    ).toThrow();
    expect(() =>
      ResultSchema.parse({
        requestedChannels: ["EXACT"],
        outcomes: { ...outcomes, FUZZY: { status: "EMPTY" } },
      }),
    ).toThrow();
  });

  it("closes requested channels and rejects legacy BM25 names", () => {
    expect(CandidateChannelSchema.options).toEqual([
      "EXACT",
      "FUZZY",
      "KEYWORD",
      "VARIANT",
      "SEMANTIC",
    ]);
    expect(
      CandidateChannelRequestSchema.parse(["EXACT", "FUZZY", "KEYWORD"]),
    ).toEqual(["EXACT", "FUZZY", "KEYWORD"]);
    expect(() =>
      CandidateChannelRequestSchema.parse(["EXACT", "EXACT"]),
    ).toThrow();
    expect(() => CandidateChannelSchema.parse("bm25")).toThrow();
    expect(() => CandidateChannelSchema.parse("custom")).toThrow();
  });
});
