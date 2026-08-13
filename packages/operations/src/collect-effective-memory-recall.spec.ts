import {
  NormalizedLanguageIdSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectMemoryRecallOp: vi.fn(),
}));

vi.mock("./collect-memory-recall.ts", async () => {
  const actual = await vi.importActual<
    typeof import("./collect-memory-recall.ts")
  >("./collect-memory-recall.ts");

  return {
    ...actual,
    collectMemoryRecallOp: mocks.collectMemoryRecallOp,
  };
});

import { RecallOperationFailureError } from "./candidate-recall.ts";
import {
  collectEffectiveMemoryRecallOp,
  getEffectiveMemoryRecallCandidates,
} from "./collect-effective-memory-recall.ts";
import { CollectMemoryRecallInputSchema } from "./collect-memory-recall.ts";

const projectMemoryId = "11111111-1111-4111-8111-111111111111";
const personalMemoryId = "22222222-2222-4222-8222-222222222222";

const suggestion = (input: {
  id: number;
  memoryId: string;
  source: string;
  translation: string;
  confidence: number;
  sourceScope: "PROJECT" | "PERSONAL";
  translationId?: number | null;
}) => ({
  id: input.id,
  translationChunkSetId: null,
  source: input.source,
  translation: input.translation,
  sourceScope: input.sourceScope,
  translationId: input.translationId ?? null,
  sourceTemplate: null,
  translationTemplate: null,
  memoryId: input.memoryId,
  creatorId: null,
  confidence: input.confidence,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  evidences: [{ channel: "exact" as const, confidence: input.confidence }],
});

const recallResult = (candidates: ReturnType<typeof suggestion>[]) => ({
  requestedChannels: ["EXACT"] as const,
  outcomes: {
    EXACT:
      candidates.length > 0
        ? { status: "SUCCEEDED" as const, candidates }
        : { status: "EMPTY" as const },
    FUZZY: { status: "SKIPPED" as const, reason: "NOT_REQUESTED" as const },
    KEYWORD: { status: "SKIPPED" as const, reason: "NOT_REQUESTED" as const },
    VARIANT: { status: "SKIPPED" as const, reason: "NOT_REQUESTED" as const },
    SEMANTIC: { status: "SKIPPED" as const, reason: "NOT_REQUESTED" as const },
  },
});

const blockedRecallError = () =>
  new RecallOperationFailureError(
    {
      code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
      message: "All requested Candidate Channels are blocked.",
      severity: "ERROR",
      retryable: true,
      blocker: "recall_derivation_pending",
      capability: "RECALL_DERIVATION",
      affectedResources: [],
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
            message: "Recall Derivation is pending.",
            retryable: true,
            capability: "RECALL_DERIVATION",
            affectedTargets: [
              {
                targetKind: "MEMORY_ITEM",
                targetId: "42",
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
  );

describe("collectEffectiveMemoryRecallOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards only public Memory Recall input to each scoped collection", async () => {
    mocks.collectMemoryRecallOp.mockResolvedValue(recallResult([]));

    await collectEffectiveMemoryRecallOp({
      text: "Server Address",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      projectMemoryIds: [projectMemoryId],
      personalMemoryIds: [personalMemoryId],
      maxAmount: 5,
    });

    expect(mocks.collectMemoryRecallOp).toHaveBeenCalledTimes(2);
    const forwarded = mocks.collectMemoryRecallOp.mock.calls.map(
      ([scopeInput]) => scopeInput,
    );
    expect(forwarded.map((scopeInput) => scopeInput.memoryIds)).toEqual([
      [projectMemoryId],
      [personalMemoryId],
    ]);
    expect(forwarded.map((scopeInput) => scopeInput.memoryScope)).toEqual([
      "PROJECT",
      "PERSONAL",
    ]);
    for (const scopeInput of forwarded) {
      expect(() =>
        CollectMemoryRecallInputSchema.parse(scopeInput),
      ).not.toThrow();
      expect(scopeInput).not.toHaveProperty("projectMemoryIds");
      expect(scopeInput).not.toHaveProperty("personalMemoryIds");
    }
  });

  it("keeps project memory when project/personal share the same dedupe key", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce(
        recallResult([
          suggestion({
            id: 1,
            memoryId: projectMemoryId,
            source: "Server Address",
            translation: "服务器地址",
            confidence: 0.82,
            sourceScope: "PROJECT",
            translationId: 3001,
          }),
        ]),
      )
      .mockResolvedValueOnce(
        recallResult([
          suggestion({
            id: 2,
            memoryId: personalMemoryId,
            source: "Server Address",
            translation: "服务器地址",
            confidence: 0.99,
            sourceScope: "PERSONAL",
            translationId: 3001,
          }),
        ]),
      );

    const composite = await collectEffectiveMemoryRecallOp({
      text: "Server Address",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      projectMemoryIds: [projectMemoryId],
      personalMemoryIds: [personalMemoryId],
      maxAmount: 5,
    });

    const result = getEffectiveMemoryRecallCandidates(composite);
    expect(result).toHaveLength(1);
    expect(composite.scopes.PROJECT.status).toBe("SUCCEEDED");
    expect(composite.scopes.PERSONAL.status).toBe("SUCCEEDED");
    expect(result[0]?.sourceScope).toBe("PROJECT");
    expect(result[0]?.memoryId).toBe(projectMemoryId);
  });

  it("keeps higher-confidence candidate within the same scope", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce(
        recallResult([
          suggestion({
            id: 3,
            memoryId: projectMemoryId,
            source: "Create New World",
            translation: "创建新的世界",
            confidence: 0.71,
            sourceScope: "PROJECT",
            translationId: 3002,
          }),
          suggestion({
            id: 4,
            memoryId: projectMemoryId,
            source: "Create New World",
            translation: "创建新的世界",
            confidence: 0.9,
            sourceScope: "PROJECT",
            translationId: 3002,
          }),
        ]),
      )
      .mockResolvedValueOnce(recallResult([]));

    const result = getEffectiveMemoryRecallCandidates(
      await collectEffectiveMemoryRecallOp({
        text: "Create New World",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        projectMemoryIds: [projectMemoryId],
        personalMemoryIds: [personalMemoryId],
        maxAmount: 5,
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(4);
    expect(result[0]?.confidence).toBe(0.9);
  });

  it("propagates personal recall failure instead of returning partial data", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce(
        recallResult([
          suggestion({
            id: 5,
            memoryId: projectMemoryId,
            source: "Hardcore Mode!",
            translation: "极限模式！",
            confidence: 0.88,
            sourceScope: "PROJECT",
            translationId: 3003,
          }),
        ]),
      )
      .mockRejectedValueOnce(new Error("personal recall down"));

    await expect(
      collectEffectiveMemoryRecallOp({
        text: "Hardcore Mode!",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        projectMemoryIds: [projectMemoryId],
        personalMemoryIds: [personalMemoryId],
        maxAmount: 5,
      }),
    ).rejects.toThrow("personal recall down");
  });

  it("propagates project recall failure instead of returning partial data", async () => {
    mocks.collectMemoryRecallOp
      .mockRejectedValueOnce(new Error("project recall down"))
      .mockResolvedValueOnce(
        recallResult([
          suggestion({
            id: 6,
            memoryId: personalMemoryId,
            source: "Inventory",
            translation: "物品栏",
            confidence: 0.76,
            sourceScope: "PERSONAL",
            translationId: 3004,
          }),
        ]),
      );

    await expect(
      collectEffectiveMemoryRecallOp({
        text: "Inventory",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        projectMemoryIds: [projectMemoryId],
        personalMemoryIds: [personalMemoryId],
        maxAmount: 5,
      }),
    ).rejects.toThrow("project recall down");
  });

  it("retains a blocked personal scope alongside project candidates", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce(
        recallResult([
          suggestion({
            id: 9,
            memoryId: projectMemoryId,
            source: "Settings",
            translation: "设置",
            confidence: 0.9,
            sourceScope: "PROJECT",
          }),
        ]),
      )
      .mockRejectedValueOnce(blockedRecallError());

    const composite = await collectEffectiveMemoryRecallOp({
      text: "Settings",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      projectMemoryIds: [projectMemoryId],
      personalMemoryIds: [personalMemoryId],
    });
    expect(composite.scopes.PERSONAL.status).toBe("BLOCKED");
    expect(getEffectiveMemoryRecallCandidates(composite)).toHaveLength(1);
  });

  it("throws when every active memory scope is blocked", async () => {
    mocks.collectMemoryRecallOp
      .mockRejectedValueOnce(blockedRecallError())
      .mockRejectedValueOnce(blockedRecallError());
    await expect(
      collectEffectiveMemoryRecallOp({
        text: "Settings",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        projectMemoryIds: [projectMemoryId],
        personalMemoryIds: [personalMemoryId],
      }),
    ).rejects.toBeInstanceOf(RecallOperationFailureError);
  });

  it("sorts merged non-duplicate results by confidence descending", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce(
        recallResult([
          suggestion({
            id: 7,
            memoryId: projectMemoryId,
            source: "Done",
            translation: "完成",
            confidence: 0.62,
            sourceScope: "PROJECT",
            translationId: 3101,
          }),
        ]),
      )
      .mockResolvedValueOnce(
        recallResult([
          suggestion({
            id: 8,
            memoryId: personalMemoryId,
            source: "Cancel",
            translation: "取消",
            confidence: 0.83,
            sourceScope: "PERSONAL",
            translationId: 3102,
          }),
        ]),
      );

    const result = getEffectiveMemoryRecallCandidates(
      await collectEffectiveMemoryRecallOp({
        text: "button",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        projectMemoryIds: [projectMemoryId],
        personalMemoryIds: [personalMemoryId],
        maxAmount: 5,
      }),
    );

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual([8, 7]);
  });
});
