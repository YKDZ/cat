import { executeCommand, executeQuery } from "@cat/domain";
import {
  LanguageAnalysisPolicyChangedError,
  RecallOperationFailureError,
} from "@cat/operations";
import { PluginManager } from "@cat/plugin-core";
import {
  NormalizedLanguageIdSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import { createAuthedTestContext } from "@cat/test-utils";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "#/utils/context.ts";

const opMocks = vi.hoisted(() => ({
  collectTermRecallOp: vi.fn(),
  getTermRecallCandidates: vi.fn(),
  collectEffectiveMemoryRecallOp: vi.fn(),
  getEffectiveMemoryRecallCandidates: vi.fn(),
  recallContextRerankOp: vi.fn(),
  rerankTermRecallOp: vi.fn(),
  termRecallOp: vi.fn(),
  languageAnalyzeOp: vi.fn(),
}));

const domainMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  getElementWithChunkIds: vi.fn(),
  listAllLanguages: vi.fn(),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");

  return {
    ...actual,
    executeCommand: domainMocks.executeCommand,
    executeQuery: vi.fn(),
    getElementWithChunkIds: domainMocks.getElementWithChunkIds,
    listAllLanguages: domainMocks.listAllLanguages,
  };
});

vi.mock("@cat/operations", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/operations")>("@cat/operations");

  return {
    ...actual,
    collectTermRecallOp: opMocks.collectTermRecallOp,
    getTermRecallCandidates: opMocks.getTermRecallCandidates,
    collectEffectiveMemoryRecallOp: opMocks.collectEffectiveMemoryRecallOp,
    getEffectiveMemoryRecallCandidates:
      opMocks.getEffectiveMemoryRecallCandidates,
    recallContextRerankOp: opMocks.recallContextRerankOp,
    rerankTermRecallOp: opMocks.rerankTermRecallOp,
    termRecallOp: opMocks.termRecallOp,
    languageAnalyzeOp: opMocks.languageAnalyzeOp,
  };
});

vi.mock("@cat/permissions", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/permissions")>(
      "@cat/permissions",
    );

  return {
    ...actual,
    getPermissionEngine: () => ({
      check: vi.fn().mockResolvedValue(true),
    }),
  };
});

import {
  getElementWithChunkIds,
  listEffectiveMemoryIdsByProject,
  listProjectGlossaryIds,
} from "@cat/domain";

import { searchTerm } from "#/orpc/routers/glossary.ts";
import {
  onNew as onNewMemory,
  searchByText as searchMemoryByText,
} from "#/orpc/routers/memory.ts";

const DEFAULT_PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const createDrizzleClient = (projectId: string) => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ projectId }]),
        }),
      }),
    }),
  } as unknown as Context["drizzleDB"]["client"];
};

const createContext = (): Context => {
  const base = createAuthedTestContext();
  const pluginManager = new PluginManager("GLOBAL", "");

  return {
    ...base,
    pluginManager,
    auth: {
      subjectType: "user",
      subjectId: base.user!.id,
      systemRoles: ["admin"],
      scopes: [],
    },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    drizzleDB: {
      client: createDrizzleClient(DEFAULT_PROJECT_ID),
    } as Context["drizzleDB"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    redis: {} as unknown as Context["redis"],
    isSSR: true,
    isWebSocket: false,
  };
};

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
};

const successfulEffectiveRecall = <TCandidate>(candidates: TCandidate[]) => ({
  scopes: {
    PROJECT: {
      status: "SUCCEEDED" as const,
      result: {
        requestedChannels: ["EXACT"] as const,
        outcomes: {
          EXACT: { status: "SUCCEEDED" as const, candidates },
          FUZZY: {
            status: "SKIPPED" as const,
            reason: "NOT_REQUESTED" as const,
          },
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
        },
      },
    },
    PERSONAL: {
      status: "SKIPPED" as const,
      reason: "NO_SCOPED_ASSETS" as const,
    },
  },
});

const successfulTermRecall = <TCandidate>(candidates: TCandidate[]) => ({
  requestedChannels: ["EXACT"] as const,
  outcomes: {
    EXACT: { status: "SUCCEEDED" as const, candidates },
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
  },
});

describe("recall routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opMocks.languageAnalyzeOp.mockResolvedValue({ tokens: [] });
    opMocks.getEffectiveMemoryRecallCandidates.mockReturnValue([]);
  });

  it("searchTerm exposes richer term evidence fields from fused recall", async () => {
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === listProjectGlossaryIds) {
        return ["11111111-1111-4111-8111-111111111111"];
      }
      return [];
    });
    const terms = [
      {
        term: "memory bank",
        translation: "记忆库",
        confidence: 0.88,
        definition: "TM repository",
        conceptId: 1,
        glossaryId: "11111111-1111-4111-8111-111111111111",
        matchedText: "memory bank",
        evidences: [
          {
            channel: "morphological",
            matchedText: "memory bank",
            matchedVariantText: "memory bank",
            matchedVariantType: "LEMMA",
            confidence: 0.88,
          },
        ],
        concept: { subjects: [], definition: "TM repository" },
      },
    ];
    opMocks.collectTermRecallOp.mockResolvedValue(successfulTermRecall(terms));
    opMocks.getTermRecallCandidates.mockReturnValue(terms);

    const stream = await call(
      searchTerm,
      {
        projectId: "33333333-3333-4333-8333-333333333333",
        text: "memory bank",
        termLanguageId: "en",
        translationLanguageId: "zh-Hans",
      },
      { context: createContext() },
    );

    const results = await collect(stream);

    expect(results).toEqual([
      expect.objectContaining({
        type: "CANDIDATE",
        candidate: expect.objectContaining({
          conceptId: 1,
          glossaryId: "11111111-1111-4111-8111-111111111111",
          matchedText: "memory bank",
          evidences: [
            expect.objectContaining({
              channel: "morphological",
              matchedVariantType: "LEMMA",
            }),
          ],
        }),
      }),
      expect.objectContaining({ type: "COMPLETED" }),
    ]);
  });

  it("emits one completed memory recall result when no effective scopes exist", async () => {
    const result = {
      scopes: {
        PROJECT: {
          status: "SKIPPED" as const,
          reason: "NO_SCOPED_ASSETS" as const,
        },
        PERSONAL: {
          status: "SKIPPED" as const,
          reason: "NO_SCOPED_ASSETS" as const,
        },
      },
    };
    opMocks.collectEffectiveMemoryRecallOp.mockResolvedValue(result);
    opMocks.recallContextRerankOp.mockResolvedValue([]);
    const element = {
      id: 1,
      value: "hello",
      languageId: "en",
      projectId: DEFAULT_PROJECT_ID,
      chunkIds: [],
    };
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return element;
      if (query === listEffectiveMemoryIdsByProject) {
        return {
          projectMemoryIds: [],
          personalMemoryIds: [],
          allMemoryIds: [],
        };
      }
      return [];
    });

    const elementStream = await call(
      onNewMemory,
      { elementId: 1, translationLanguageId: "zh-Hans" },
      { context: createContext() },
    );
    const textStream = await call(
      searchMemoryByText,
      {
        projectId: DEFAULT_PROJECT_ID,
        text: "hello",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
      },
      { context: createContext() },
    );

    await expect(collect(elementStream)).resolves.toEqual([
      { type: "COMPLETED", result },
    ]);
    await expect(collect(textStream)).resolves.toEqual([
      { type: "COMPLETED", result },
    ]);
  });

  it("memory.onNew yields all memories directly without LLM adaptation", async () => {
    const element = {
      id: 1,
      value: "Order 43 completed",
      languageId: "en",
      projectId: "33333333-3333-4333-8333-333333333333",
      chunkIds: [1],
    };

    domainMocks.getElementWithChunkIds.mockResolvedValue(element);
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return element;
      if (query === listEffectiveMemoryIdsByProject)
        return {
          projectMemoryIds: ["22222222-2222-4222-8222-222222222222"],
          personalMemoryIds: [],
          allMemoryIds: ["22222222-2222-4222-8222-222222222222"],
        };
      return [];
    });

    const memories = [
      {
        id: 301,
        source: "Order 42 completed",
        translation: "订单 42 已完成",
        confidence: 0.83,
        memoryId: "22222222-2222-4222-8222-222222222222",
        sourceScope: "PROJECT" as const,
        translationChunkSetId: null,
        creatorId: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        evidences: [{ channel: "exact", confidence: 0.83 }],
      },
      {
        id: 302,
        source: "Order completed",
        translation: "订单已完成",
        confidence: 0.7,
        memoryId: "22222222-2222-4222-8222-222222222222",
        sourceScope: "PROJECT" as const,
        translationChunkSetId: null,
        creatorId: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        evidences: [{ channel: "exact", confidence: 0.7 }],
      },
    ];

    const recallResult = successfulEffectiveRecall(memories);
    opMocks.collectEffectiveMemoryRecallOp.mockResolvedValue(recallResult);
    opMocks.getEffectiveMemoryRecallCandidates.mockReturnValue(memories);
    opMocks.recallContextRerankOp.mockResolvedValue(memories);

    const stream = await call(
      onNewMemory,
      { elementId: 1, translationLanguageId: "zh-Hans" },
      { context: createContext() },
    );

    const results = await collect(stream);

    // All memories yielded directly — no adaptationPending, no LLM round-trip
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      type: "CANDIDATE",
      candidate: expect.objectContaining({ id: 301, confidence: 0.83 }),
    });
    expect(results[0]).toEqual(
      expect.not.objectContaining({
        candidate: expect.objectContaining({
          adaptationPending: expect.anything(),
        }),
      }),
    );
    expect(results[1]).toEqual({
      type: "CANDIDATE",
      candidate: expect.objectContaining({ id: 302, confidence: 0.7 }),
    });
    expect(results[1]).toEqual(
      expect.not.objectContaining({
        candidate: expect.objectContaining({
          adaptationPending: expect.anything(),
        }),
      }),
    );
    expect(results[2]).toEqual({ type: "COMPLETED", result: recallResult });
  });

  it.skip("persists a language analysis failure once instead of returning an empty stream", async () => {
    const element = {
      id: 1,
      value: "Order 43 completed",
      languageId: "en",
      projectId: DEFAULT_PROJECT_ID,
      chunkIds: [1],
    };
    domainMocks.getElementWithChunkIds.mockResolvedValue(element);
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return element;
      if (query === listEffectiveMemoryIdsByProject)
        return {
          projectMemoryIds: ["22222222-2222-4222-8222-222222222222"],
          personalMemoryIds: [],
          allMemoryIds: ["22222222-2222-4222-8222-222222222222"],
        };
      return [];
    });
    opMocks.languageAnalyzeOp.mockRejectedValue(
      new LanguageAnalysisPolicyChangedError(new Error("selection revision 9")),
    );
    domainMocks.executeCommand.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      message: "Language analysis configuration changed during the operation.",
    });

    const stream = await call(
      onNewMemory,
      { elementId: 1, translationLanguageId: "zh-Hans" },
      { context: createContext() },
    );

    await expect(collect(stream)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      data: {
        operationFailure: { id: "11111111-1111-4111-8111-111111111111" },
      },
    });
    expect(executeCommand).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        failure: expect.objectContaining({
          affectedResources: [
            { type: "PROJECT", id: DEFAULT_PROJECT_ID },
            { type: "ELEMENT", id: "1" },
          ],
        }),
      }),
    );
  });

  it("persists a blocked recall failure instead of returning an empty stream", async () => {
    const element = {
      id: 1,
      value: "Order 43 completed",
      languageId: "en",
      projectId: DEFAULT_PROJECT_ID,
      chunkIds: [1],
    };
    domainMocks.getElementWithChunkIds.mockResolvedValue(element);
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return element;
      if (query === listEffectiveMemoryIdsByProject) {
        return {
          projectMemoryIds: ["22222222-2222-4222-8222-222222222222"],
          personalMemoryIds: [],
          allMemoryIds: ["22222222-2222-4222-8222-222222222222"],
        };
      }
      return [];
    });
    opMocks.collectEffectiveMemoryRecallOp.mockRejectedValue(
      new RecallOperationFailureError(
        {
          code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
          message: "All requested Candidate Channels are blocked.",
          severity: "ERROR",
          retryable: true,
          blocker: "recall_derivation_pending",
          capability: "RECALL_DERIVATION",
          affectedResources: [],
          remediationHint:
            "Resolve the reported recall dependencies, then retry.",
          redactionBoundary: "PUBLIC",
        },
        {
          requestedChannels: ["KEYWORD"],
          outcomes: {
            EXACT: { status: "SKIPPED", reason: "NOT_REQUESTED" },
            FUZZY: { status: "SKIPPED", reason: "NOT_REQUESTED" },
            KEYWORD: {
              status: "BLOCKED",
              blocker: {
                reason: "RECALL_DERIVATION_PENDING",
                message: "Recall Variants are pending.",
                retryable: true,
                capability: "RECALL_DERIVATION",
                affectedTargets: [
                  {
                    targetKind: "MEMORY_ITEM",
                    targetId: "1",
                    languageId: NormalizedLanguageIdSchema.parse("en"),
                  },
                ],
                requiredDerivationVersion: RecallDerivationVersionSchema.parse(
                  `sha256:${"a".repeat(64)}`,
                ),
              },
            },
            VARIANT: { status: "SKIPPED", reason: "NOT_REQUESTED" },
            SEMANTIC: { status: "SKIPPED", reason: "NOT_REQUESTED" },
          },
        },
      ),
    );
    domainMocks.executeCommand.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      message: "All requested Candidate Channels are blocked.",
    });

    const stream = await call(
      onNewMemory,
      { elementId: 1, translationLanguageId: "zh-Hans" },
      { context: createContext() },
    );

    await expect(collect(stream)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      data: {
        operationFailure: { id: "11111111-1111-4111-8111-111111111111" },
      },
    });
    expect(executeCommand).toHaveBeenCalledOnce();
  });

  it("memory.onNew yields exact-match memories without calling any LLM operation", async () => {
    const element = {
      id: 1,
      value: "Order 43 completed",
      languageId: "en",
      projectId: "33333333-3333-4333-8333-333333333333",
      chunkIds: [1],
    };

    domainMocks.getElementWithChunkIds.mockResolvedValue(element);
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return element;
      if (query === listEffectiveMemoryIdsByProject)
        return {
          projectMemoryIds: ["22222222-2222-4222-8222-222222222222"],
          personalMemoryIds: [],
          allMemoryIds: ["22222222-2222-4222-8222-222222222222"],
        };
      return [];
    });

    const exactMemory = {
      id: 302,
      source: "Order 43 completed",
      translation: "订单 43 已完成",
      confidence: 1,
      adaptationMethod: "exact" as const,
      memoryId: "22222222-2222-4222-8222-222222222222",
      sourceScope: "PROJECT" as const,
      translationChunkSetId: null,
      creatorId: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      evidences: [{ channel: "exact", confidence: 1 }],
    };

    const recallResult = successfulEffectiveRecall([exactMemory]);
    opMocks.collectEffectiveMemoryRecallOp.mockResolvedValue(recallResult);
    opMocks.getEffectiveMemoryRecallCandidates.mockReturnValue([exactMemory]);
    opMocks.recallContextRerankOp.mockResolvedValue([exactMemory]);

    const stream = await call(
      onNewMemory,
      { elementId: 1, translationLanguageId: "zh-Hans" },
      { context: createContext() },
    );

    const results = await collect(stream);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      type: "CANDIDATE",
      candidate: expect.objectContaining({
        id: 302,
        adaptationMethod: "exact",
      }),
    });
    expect(results[0]).toEqual(
      expect.not.objectContaining({
        candidate: expect.objectContaining({
          adaptationPending: expect.anything(),
        }),
      }),
    );
    expect(results[1]).toEqual({ type: "COMPLETED", result: recallResult });
  });
});
