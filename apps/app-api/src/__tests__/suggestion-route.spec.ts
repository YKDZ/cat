import { PluginManager } from "@cat/plugin-core";
import { createAuthedTestContext } from "@cat/test-utils";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "@/utils/context";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const opMocks = vi.hoisted(() => ({
  collectMemoryRecallOp: vi.fn(),
  termRecallOp: vi.fn(),
  llmTranslateOp: vi.fn(),
}));

const domainMocks = vi.hoisted(() => ({
  getElementWithChunkIds: vi.fn(),
  findOpenAutoTranslatePR: vi.fn(),
}));

const workflowMocks = vi.hoisted(() => ({
  getGlobalGraphRuntime: vi.fn(),
  runGraph: vi.fn(),
  fetchAdviseGraph: {},
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return {
    ...actual,
    executeQuery: vi.fn(),
    getElementWithChunkIds: domainMocks.getElementWithChunkIds,
    findOpenAutoTranslatePR: domainMocks.findOpenAutoTranslatePR,
  };
});

vi.mock("@cat/operations", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/operations")>("@cat/operations");
  return {
    ...actual,
    collectMemoryRecallOp: opMocks.collectMemoryRecallOp,
    termRecallOp: opMocks.termRecallOp,
    llmTranslateOp: opMocks.llmTranslateOp,
  };
});

vi.mock("@cat/workflow/tasks", () => ({
  getGlobalGraphRuntime: workflowMocks.getGlobalGraphRuntime,
  runGraph: workflowMocks.runGraph,
  fetchAdviseGraph: workflowMocks.fetchAdviseGraph,
}));

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

vi.mock("@cat/vcs", () => ({
  readWithOverlay: vi.fn().mockResolvedValue(null),
}));

// ─── Imports after mocks ────────────────────────────────────────────────────

import { executeQuery } from "@cat/domain";
import {
  findOpenAutoTranslatePR,
  getElementWithChunkIds,
  listMemoryIdsByProject,
  listProjectGlossaryIds,
} from "@cat/domain";

import { suggest as ghostTextSuggest } from "@/orpc/routers/ghost-text";
import { onNew as onNewSuggestion } from "@/orpc/routers/suggestion";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    drizzleDB: { client: {} } as unknown as Context["drizzleDB"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    redis: {} as unknown as Context["redis"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    cacheStore: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as unknown as Context["cacheStore"],
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

const MOCK_ELEMENT = {
  id: 10,
  value: "Save changes",
  languageId: "en",
  projectId: "44444444-4444-4444-8444-444444444444",
  chunkIds: [],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("suggestion.onNew", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: unsubscribe function returned by eventBus.subscribe
    workflowMocks.getGlobalGraphRuntime.mockReturnValue({
      eventBus: {
        subscribe: vi.fn().mockReturnValue(() => {
          /* empty */
        }),
      },
    });

    domainMocks.getElementWithChunkIds.mockResolvedValue(MOCK_ELEMENT);
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return MOCK_ELEMENT;
      if (query === listProjectGlossaryIds) return [];
      if (query === listMemoryIdsByProject) return [];
      return []; // listNeighborElements fallback
    });

    opMocks.collectMemoryRecallOp.mockResolvedValue([]);
    opMocks.termRecallOp.mockResolvedValue({ terms: [] });
    opMocks.llmTranslateOp.mockResolvedValue({ suggestion: null });
  });

  it("yields Smart Suggestion when LLM is available and no external advisors are configured", async () => {
    opMocks.llmTranslateOp.mockResolvedValue({
      suggestion: {
        translation: "保存更改",
        confidence: 0.5,
        meta: { source: "llm-translate", signalClasses: ["source"] },
      },
    });

    const stream = await call(
      onNewSuggestion,
      { elementId: 10, languageId: "zh-Hans" },
      { context: createContext() },
    );

    const results = await collect(stream);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        translation: "保存更改",
        confidence: 0.5,
      }),
    );
    expect(results[0]).not.toHaveProperty("advisorId");
    expect(opMocks.llmTranslateOp).toHaveBeenCalledOnce();
    expect(opMocks.llmTranslateOp).toHaveBeenCalledWith(
      expect.objectContaining({
        elementId: 10,
        targetLanguageId: "zh-Hans",
        config: {},
      }),
      expect.anything(),
    );
  });

  it("does not yield when Smart Suggestion returns null", async () => {
    opMocks.llmTranslateOp.mockResolvedValue({ suggestion: null });

    const stream = await call(
      onNewSuggestion,
      { elementId: 10, languageId: "zh-Hans" },
      { context: createContext() },
    );

    const results = await collect(stream);
    expect(results).toHaveLength(0);
  });

  it("stream completes without throwing when Smart Suggestion rejects", async () => {
    opMocks.llmTranslateOp.mockRejectedValue(new Error("LLM unavailable"));

    const stream = await call(
      onNewSuggestion,
      { elementId: 10, languageId: "zh-Hans" },
      { context: createContext() },
    );

    // Should not throw
    const results = await collect(stream);
    expect(results).toHaveLength(0);
  });

  it("passes preloaded memories to llmTranslateOp when memories are available", async () => {
    const memory = {
      id: 1,
      source: "Save changes",
      translation: "保存更改",
      confidence: 0.95,
      memoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      translationChunkSetId: null,
      creatorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      evidences: [],
    };

    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return MOCK_ELEMENT;
      if (query === listProjectGlossaryIds) return [];
      if (query === listMemoryIdsByProject)
        return ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];
      return [];
    });

    opMocks.collectMemoryRecallOp.mockResolvedValue([memory]);
    opMocks.llmTranslateOp.mockResolvedValue({ suggestion: null });

    const stream = await call(
      onNewSuggestion,
      { elementId: 10, languageId: "zh-Hans" },
      { context: createContext() },
    );

    await collect(stream);

    expect(opMocks.llmTranslateOp).toHaveBeenCalledWith(
      expect.objectContaining({
        elementId: 10,
        targetLanguageId: "zh-Hans",
        config: {},
        memories: expect.arrayContaining([
          expect.objectContaining({ source: "Save changes", confidence: 0.95 }),
        ]),
      }),
      expect.anything(),
    );
  });
});

describe("ghost-text.suggest", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    domainMocks.getElementWithChunkIds.mockResolvedValue(MOCK_ELEMENT);
    domainMocks.findOpenAutoTranslatePR.mockResolvedValue(null);
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return MOCK_ELEMENT;
      if (query === findOpenAutoTranslatePR) return null;
      return null;
    });

    opMocks.llmTranslateOp.mockResolvedValue({ suggestion: null });
  });

  it("yields pre-translate result when auto-translate PR is found", async () => {
    const mockPR = { branchId: "branch-1" };
    domainMocks.findOpenAutoTranslatePR.mockResolvedValue(mockPR);
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) return MOCK_ELEMENT;
      if (query === findOpenAutoTranslatePR) return mockPR;
      return null;
    });

    const { readWithOverlay } = await import("@cat/vcs");
    vi.mocked(readWithOverlay).mockResolvedValue({
      data: { text: "保存更改 (pre-translate)" },
      action: "UPDATE" as const,
    });

    const stream = await call(
      ghostTextSuggest,
      {
        elementId: 10,
        languageId: "zh-Hans",
        currentInput: "",
        cursorPosition: 0,
      },
      { context: createContext() },
    );

    const results = await collect(stream);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ text: "保存更改 (pre-translate)" });
    // Smart Suggestion NOT called when pre-translate result exists
    expect(opMocks.llmTranslateOp).not.toHaveBeenCalled();
  });

  it("falls back to Smart Suggestion when no auto-translate PR result", async () => {
    opMocks.llmTranslateOp.mockResolvedValue({
      suggestion: {
        translation: "保存更改",
        confidence: 0.5,
        meta: { source: "llm-translate", signalClasses: ["source"] },
      },
    });

    const stream = await call(
      ghostTextSuggest,
      {
        elementId: 10,
        languageId: "zh-Hans",
        currentInput: "",
        cursorPosition: 0,
      },
      { context: createContext() },
    );

    const results = await collect(stream);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ text: "保存更改" });
    expect(opMocks.llmTranslateOp).toHaveBeenCalledOnce();
    expect(opMocks.llmTranslateOp).toHaveBeenCalledWith(
      expect.objectContaining({
        elementId: 10,
        targetLanguageId: "zh-Hans",
        config: expect.objectContaining({
          elementContexts: { enabled: false },
          approvedTranslations: { enabled: false },
          comments: { enabled: false },
        }),
      }),
      expect.anything(),
    );
  });

  it("yields nothing when both auto-translate and Smart Suggestion produce no result", async () => {
    opMocks.llmTranslateOp.mockResolvedValue({ suggestion: null });

    const stream = await call(
      ghostTextSuggest,
      {
        elementId: 10,
        languageId: "zh-Hans",
        currentInput: "",
        cursorPosition: 0,
      },
      { context: createContext() },
    );

    const results = await collect(stream);
    expect(results).toHaveLength(0);
    // Frontend handles fallback
  });
});
