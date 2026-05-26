import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectMemoryRecallOp: vi.fn(),
}));

vi.mock("./collect-memory-recall", async () => {
  const actual = await vi.importActual<
    typeof import("./collect-memory-recall")
  >("./collect-memory-recall");

  return {
    ...actual,
    collectMemoryRecallOp: mocks.collectMemoryRecallOp,
  };
});

import { collectEffectiveMemoryRecallOp } from "./collect-effective-memory-recall";

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
  evidences: [],
});

describe("collectEffectiveMemoryRecallOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps project memory when project/personal share the same dedupe key", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce([
        suggestion({
          id: 1,
          memoryId: projectMemoryId,
          source: "Server Address",
          translation: "服务器地址",
          confidence: 0.82,
          sourceScope: "PROJECT",
          translationId: 3001,
        }),
      ])
      .mockResolvedValueOnce([
        suggestion({
          id: 2,
          memoryId: personalMemoryId,
          source: "Server Address",
          translation: "服务器地址",
          confidence: 0.99,
          sourceScope: "PERSONAL",
          translationId: 3001,
        }),
      ]);

    const result = await collectEffectiveMemoryRecallOp({
      text: "Server Address",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      projectMemoryIds: [projectMemoryId],
      personalMemoryIds: [personalMemoryId],
      maxAmount: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceScope).toBe("PROJECT");
    expect(result[0]?.memoryId).toBe(projectMemoryId);
  });

  it("keeps higher-confidence candidate within the same scope", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([]);

    const result = await collectEffectiveMemoryRecallOp({
      text: "Create New World",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      projectMemoryIds: [projectMemoryId],
      personalMemoryIds: [personalMemoryId],
      maxAmount: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(4);
    expect(result[0]?.confidence).toBe(0.9);
  });

  it("returns project results when personal recall fails", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce([
        suggestion({
          id: 5,
          memoryId: projectMemoryId,
          source: "Hardcore Mode!",
          translation: "极限模式！",
          confidence: 0.88,
          sourceScope: "PROJECT",
          translationId: 3003,
        }),
      ])
      .mockRejectedValueOnce(new Error("personal recall down"));

    const result = await collectEffectiveMemoryRecallOp({
      text: "Hardcore Mode!",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      projectMemoryIds: [projectMemoryId],
      personalMemoryIds: [personalMemoryId],
      maxAmount: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceScope).toBe("PROJECT");
    expect(result[0]?.translation).toBe("极限模式！");
  });

  it("falls back to personal results when project recall fails", async () => {
    mocks.collectMemoryRecallOp
      .mockRejectedValueOnce(new Error("project recall down"))
      .mockResolvedValueOnce([
        suggestion({
          id: 6,
          memoryId: personalMemoryId,
          source: "Inventory",
          translation: "物品栏",
          confidence: 0.76,
          sourceScope: "PERSONAL",
          translationId: 3004,
        }),
      ]);

    const result = await collectEffectiveMemoryRecallOp({
      text: "Inventory",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      projectMemoryIds: [projectMemoryId],
      personalMemoryIds: [personalMemoryId],
      maxAmount: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceScope).toBe("PERSONAL");
    expect(result[0]?.translation).toBe("物品栏");
  });

  it("sorts merged non-duplicate results by confidence descending", async () => {
    mocks.collectMemoryRecallOp
      .mockResolvedValueOnce([
        suggestion({
          id: 7,
          memoryId: projectMemoryId,
          source: "Done",
          translation: "完成",
          confidence: 0.62,
          sourceScope: "PROJECT",
          translationId: 3101,
        }),
      ])
      .mockResolvedValueOnce([
        suggestion({
          id: 8,
          memoryId: personalMemoryId,
          source: "Cancel",
          translation: "取消",
          confidence: 0.83,
          sourceScope: "PERSONAL",
          translationId: 3102,
        }),
      ]);

    const result = await collectEffectiveMemoryRecallOp({
      text: "button",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      projectMemoryIds: [projectMemoryId],
      personalMemoryIds: [personalMemoryId],
      maxAmount: 5,
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual([8, 7]);
  });
});
