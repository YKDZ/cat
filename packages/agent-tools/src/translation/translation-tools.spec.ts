import type { ToolExecutionContext } from "@cat/agent";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  qaOp: vi.fn(),
  termRecallOp: vi.fn(),
  tokenizeOp: vi.fn(),
  collectMemoryRecallOp: vi.fn(),
}));

vi.mock("@cat/operations", () => ({
  qaOp: mocked.qaOp,
  termRecallOp: mocked.termRecallOp,
  tokenizeOp: mocked.tokenizeOp,
  collectMemoryRecallOp: mocked.collectMemoryRecallOp,
}));

import { qaCheckTool } from "./qa-check.tool.ts";
import { searchTermbaseTool } from "./search-termbase.tool.ts";
import { searchTmTool } from "./search-tm.tool.ts";

const createCtx = (
  overrides?: Partial<ToolExecutionContext["session"]>,
): ToolExecutionContext => ({
  session: {
    sessionId: "11111111-1111-4111-8111-111111111111",
    agentId: "agent-1",
    projectId: "project-1",
    runId: "22222222-2222-4222-8222-222222222222",
    languageId: "zh-CN",
    sourceLanguageId: "en-US",
    ...overrides,
  },
  permissions: {
    checkPermission: vi.fn().mockResolvedValue(true),
  },
  cost: { budgetId: "budget-1", remainingTokens: 10_000 },
  vcsMode: "trust",
});

describe("translation tools", () => {
  beforeEach(() => {
    mocked.qaOp.mockReset();
    mocked.termRecallOp.mockReset();
    mocked.tokenizeOp.mockReset();
    mocked.collectMemoryRecallOp.mockReset();
  });

  it("uses session language fallback when searching translation memory", async () => {
    mocked.collectMemoryRecallOp.mockResolvedValue([
      {
        source: "hello",
        translation: "你好",
        adaptedTranslation: null,
        confidence: 0.91,
        memoryId: "33333333-3333-4333-8333-333333333333",
        evidences: [],
      },
    ]);

    const result = await searchTmTool.execute({ text: "hello" }, createCtx());

    expect(mocked.collectMemoryRecallOp).toHaveBeenCalledWith({
      text: "hello",
      sourceLanguageId: "en-US",
      translationLanguageId: "zh-CN",
      memoryIds: [],
      chunkIds: [],
      minSimilarity: 0.72,
      maxAmount: 5,
    });
    expect(result).toEqual({
      memories: [
        {
          source: "hello",
          translation: "你好",
          confidence: 0.91,
          memoryId: "33333333-3333-4333-8333-333333333333",
          evidences: [],
          matchedText: undefined,
          matchedVariantText: undefined,
          matchedVariantType: undefined,
        },
      ],
    });
  });

  it("prefers explicit language arguments over session fallback for termbase lookup", async () => {
    mocked.termRecallOp.mockResolvedValue({
      terms: [{ source: "cat", target: "猫" }],
    });

    await searchTermbaseTool.execute(
      {
        text: "cat",
        sourceLanguageId: "fr-FR",
        translationLanguageId: "de-DE",
      },
      createCtx(),
    );

    expect(mocked.termRecallOp).toHaveBeenCalledWith({
      text: "cat",
      sourceLanguageId: "fr-FR",
      translationLanguageId: "de-DE",
      glossaryIds: [],
      wordSimilarityThreshold: 0.3,
    });
  });

  it("uses session language fallback for qa_check", async () => {
    mocked.tokenizeOp
      .mockResolvedValueOnce({ tokens: ["hello"] })
      .mockResolvedValueOnce({ tokens: ["你好"] });
    mocked.qaOp.mockResolvedValue({ result: [] });

    const result = await qaCheckTool.execute(
      {
        sourceText: "hello",
        translatedText: "你好",
      },
      createCtx(),
    );

    expect(mocked.qaOp).toHaveBeenCalledWith({
      source: {
        languageId: "en-US",
        text: "hello",
        tokens: ["hello"],
      },
      translation: {
        languageId: "zh-CN",
        text: "你好",
        tokens: ["你好"],
      },
      glossaryIds: [],
    });
    expect(result).toEqual({ passed: true, issues: [] });
  });
});
