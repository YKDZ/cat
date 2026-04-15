import type { ToolExecutionContext } from "@cat/agent";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  qaOp: vi.fn(),
  termRecallOp: vi.fn(),
  tokenizeOp: vi.fn(),
  collectMemoryRecallOp: vi.fn(),
  createTranslationOp: vi.fn(),
  getDocument: Symbol("getDocument"),
  getLanguage: Symbol("getLanguage"),
  getDocumentElements: Symbol("getDocumentElements"),
  getElementContexts: Symbol("getElementContexts"),
  getElementWithChunkIds: Symbol("getElementWithChunkIds"),
  getProjectTargetLanguages: Symbol("getProjectTargetLanguages"),
  listProjectDocuments: Symbol("listProjectDocuments"),
  listMemoryIdsByProject: Symbol("listMemoryIdsByProject"),
  listNeighborElements: Symbol("listNeighborElements"),
  listTranslationsByElement: Symbol("listTranslationsByElement"),
  executeQuery: vi.fn(),
  getDbHandle: vi.fn().mockResolvedValue({ client: { tag: "db" } }),
  firstOrGivenService: vi.fn(),
  resolvePluginManager: vi.fn(),
}));

vi.mock("@cat/domain", () => ({
  executeQuery: mocked.executeQuery,
  getDbHandle: mocked.getDbHandle,
  getDocument: mocked.getDocument,
  getLanguage: mocked.getLanguage,
  getDocumentElements: mocked.getDocumentElements,
  getElementContexts: mocked.getElementContexts,
  getElementWithChunkIds: mocked.getElementWithChunkIds,
  getProjectTargetLanguages: mocked.getProjectTargetLanguages,
  listProjectDocuments: mocked.listProjectDocuments,
  listMemoryIdsByProject: mocked.listMemoryIdsByProject,
  listNeighborElements: mocked.listNeighborElements,
  listTranslationsByElement: mocked.listTranslationsByElement,
}));

vi.mock("@cat/operations", () => ({
  qaOp: mocked.qaOp,
  termRecallOp: mocked.termRecallOp,
  tokenizeOp: mocked.tokenizeOp,
  collectMemoryRecallOp: mocked.collectMemoryRecallOp,
  createTranslationOp: mocked.createTranslationOp,
}));

vi.mock("@cat/server-shared/plugin", () => ({
  firstOrGivenService: mocked.firstOrGivenService,
  resolvePluginManager: mocked.resolvePluginManager,
}));

import { getDocumentsTool } from "./get-documents.tool.ts";
import { getNeighborsTool } from "./get-neighbors.tool.ts";
import { getTranslationsTool } from "./get-translations.tool.ts";
import { listElementsTool } from "./list-elements.tool.ts";
import { qaCheckTool } from "./qa-check.tool.ts";
import { searchTermbaseTool } from "./search-termbase.tool.ts";
import { searchTmTool } from "./search-tm.tool.ts";
import { submitTranslationTool } from "./submit-translation.tool.ts";

const createCtx = (
  overrides?: Partial<ToolExecutionContext["session"]>,
): ToolExecutionContext => ({
  session: {
    sessionId: "11111111-1111-4111-8111-111111111111",
    agentId: "agent-1",
    projectId: "project-1",
    runId: "22222222-2222-4222-8222-222222222222",
    documentId: "33333333-3333-4333-8333-333333333333",
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
    mocked.createTranslationOp.mockReset();
    mocked.executeQuery.mockReset();
    mocked.getDbHandle.mockClear();
    mocked.firstOrGivenService.mockReset();
    mocked.resolvePluginManager.mockReset();
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

  it("lists project documents with session project fallback and pagination", async () => {
    const createdAt = new Date("2025-01-01T00:00:00.000Z");
    const updatedAt = new Date("2025-01-02T00:00:00.000Z");
    mocked.executeQuery.mockResolvedValueOnce([
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "docs",
        projectId: "project-1",
        creatorId: "55555555-5555-4555-8555-555555555555",
        fileHandlerId: null,
        fileId: null,
        isDirectory: true,
        createdAt,
        updatedAt,
        parentId: null,
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "README.md",
        projectId: "project-1",
        creatorId: "55555555-5555-4555-8555-555555555555",
        fileHandlerId: 9,
        fileId: 10,
        isDirectory: false,
        createdAt,
        updatedAt,
        parentId: "44444444-4444-4444-8444-444444444444",
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        name: "guide.md",
        projectId: "project-1",
        creatorId: "55555555-5555-4555-8555-555555555555",
        fileHandlerId: 9,
        fileId: 11,
        isDirectory: false,
        createdAt,
        updatedAt,
        parentId: "44444444-4444-4444-8444-444444444444",
      },
    ]);

    const result = await getDocumentsTool.execute({ pageSize: 2 }, createCtx());

    expect(mocked.executeQuery).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.listProjectDocuments,
      {
        projectId: "project-1",
        page: 0,
        pageSize: 3,
      },
    );
    expect(result).toEqual({
      documents: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "docs",
          projectId: "project-1",
          creatorId: "55555555-5555-4555-8555-555555555555",
          fileHandlerId: null,
          fileId: null,
          isDirectory: true,
          createdAt,
          updatedAt,
          parentId: null,
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          name: "README.md",
          projectId: "project-1",
          creatorId: "55555555-5555-4555-8555-555555555555",
          fileHandlerId: 9,
          fileId: 10,
          isDirectory: false,
          createdAt,
          updatedAt,
          parentId: "44444444-4444-4444-8444-444444444444",
        },
      ],
      page: 0,
      pageSize: 2,
      hasMore: true,
    });
  });

  it("uses session document and language fallback when listing elements", async () => {
    // First call: assertDocumentInSession → getDocument
    mocked.executeQuery.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      projectId: "project-1",
    });
    // Second call: getDocumentElements
    mocked.executeQuery.mockResolvedValueOnce([
      {
        id: 1,
        value: "Hello",
        languageId: "en-US",
        status: "NO",
        sortIndex: 10,
      },
      {
        id: 2,
        value: "World",
        languageId: "en-US",
        status: "TRANSLATED",
        sortIndex: 20,
      },
    ]);

    const result = await listElementsTool.execute({ pageSize: 2 }, createCtx());

    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      1,
      { db: { tag: "db" } },
      mocked.getDocument,
      { documentId: "33333333-3333-4333-8333-333333333333" },
    );
    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      2,
      { db: { tag: "db" } },
      mocked.getDocumentElements,
      {
        documentId: "33333333-3333-4333-8333-333333333333",
        page: 0,
        pageSize: 2,
        searchQuery: undefined,
        languageId: "zh-CN",
        isTranslated: undefined,
        isApproved: undefined,
      },
    );
    expect(result).toEqual({
      elements: [
        {
          id: 1,
          sourceText: "Hello",
          languageId: "en-US",
          status: "NO",
          sortIndex: 10,
        },
        {
          id: 2,
          sourceText: "World",
          languageId: "en-US",
          status: "TRANSLATED",
          sortIndex: 20,
        },
      ],
      page: 0,
      pageSize: 2,
      hasMore: true,
    });
  });

  it("delegates get_neighbors and reshapes neighbor output", async () => {
    // First call: assertElementInSession → getElementWithChunkIds
    mocked.executeQuery.mockResolvedValueOnce({
      value: "Target sentence",
      languageId: "en-US",
      projectId: "project-1",
      documentId: "33333333-3333-4333-8333-333333333333",
      chunkIds: [],
    });
    // Second call: listNeighborElements
    mocked.executeQuery.mockResolvedValueOnce([
      {
        id: 8,
        value: "Previous sentence",
        languageId: "en-US",
        approvedTranslation: "上一句",
        approvedTranslationLanguageId: "zh-CN",
        offset: -1,
      },
    ]);

    const result = await getNeighborsTool.execute(
      { elementId: 9, windowSize: 1 },
      createCtx(),
    );

    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      1,
      { db: { tag: "db" } },
      mocked.getElementWithChunkIds,
      { elementId: 9 },
    );
    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      2,
      { db: { tag: "db" } },
      mocked.listNeighborElements,
      { elementId: 9, windowSize: 1 },
    );
    expect(result).toEqual({
      neighbors: [
        {
          id: 8,
          sourceText: "Previous sentence",
          languageId: "en-US",
          approvedTranslation: "上一句",
          approvedTranslationLanguageId: "zh-CN",
          offset: -1,
        },
      ],
    });
  });

  it("uses session language fallback and optionally loads contexts for get_translations", async () => {
    const createdAt = new Date("2025-01-01T00:00:00.000Z");
    // First call: assertElementInSession → getElementWithChunkIds
    mocked.executeQuery
      .mockResolvedValueOnce({
        value: "Hello",
        languageId: "en-US",
        projectId: "project-1",
        documentId: "33333333-3333-4333-8333-333333333333",
        chunkIds: [],
      })
      // Second call: listTranslationsByElement
      .mockResolvedValueOnce([
        {
          id: 7,
          text: "你好",
          vote: 3,
          translatorId: "translator-1",
          createdAt,
        },
      ])
      // Third call: getElementContexts
      .mockResolvedValueOnce({
        element: { meta: null, createdAt, updatedAt: createdAt },
        contexts: [{ kind: "comment", value: "UI label" }],
      });

    const result = await getTranslationsTool.execute(
      { elementId: 5, includeContext: true },
      createCtx(),
    );

    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      1,
      { db: { tag: "db" } },
      mocked.getElementWithChunkIds,
      { elementId: 5 },
    );
    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      2,
      { db: { tag: "db" } },
      mocked.listTranslationsByElement,
      { elementId: 5, languageId: "zh-CN" },
    );
    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      3,
      { db: { tag: "db" } },
      mocked.getElementContexts,
      { elementId: 5 },
    );
    expect(result).toEqual({
      translations: [
        {
          id: 7,
          text: "你好",
          vote: 3,
          translatorId: "translator-1",
          createdAt,
        },
      ],
      contexts: [{ kind: "comment", value: "UI label" }],
    });
  });

  it("submits translations through createTranslationOp with plugin services and memory ids", async () => {
    mocked.executeQuery
      .mockResolvedValueOnce({
        value: "Hello",
        languageId: "en-US",
        projectId: "project-1",
        documentId: "33333333-3333-4333-8333-333333333333",
        chunkIds: [1, 2],
      })
      .mockResolvedValueOnce({
        id: "zh-CN",
      })
      .mockResolvedValueOnce([
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
      ]);
    mocked.resolvePluginManager.mockReturnValue({ tag: "plugin-manager" });
    mocked.firstOrGivenService
      .mockReturnValueOnce({ id: 101, service: { tag: "vectorizer" } })
      .mockReturnValueOnce({ id: 202, service: { tag: "vector-storage" } });
    mocked.createTranslationOp.mockResolvedValue({
      translationIds: [88],
      memoryItemIds: [99],
    });

    const result = await submitTranslationTool.execute(
      { elementId: 5, text: "你好" },
      createCtx(),
    );

    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      1,
      { db: { tag: "db" } },
      mocked.getElementWithChunkIds,
      { elementId: 5 },
    );
    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      2,
      { db: { tag: "db" } },
      mocked.getLanguage,
      { languageId: "zh-CN" },
    );
    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      3,
      { db: { tag: "db" } },
      mocked.listMemoryIdsByProject,
      { projectId: "project-1" },
    );
    expect(mocked.resolvePluginManager).toHaveBeenCalledWith(undefined); // ctx.pluginManager is undefined in createCtx()
    expect(mocked.firstOrGivenService).toHaveBeenNthCalledWith(
      1,
      { tag: "plugin-manager" },
      "TEXT_VECTORIZER",
    );
    expect(mocked.firstOrGivenService).toHaveBeenNthCalledWith(
      2,
      { tag: "plugin-manager" },
      "VECTOR_STORAGE",
    );
    expect(mocked.createTranslationOp).toHaveBeenCalledWith({
      data: [
        {
          translatableElementId: 5,
          text: "你好",
          languageId: "zh-CN",
        },
      ],
      translatorId: null,
      memoryIds: [
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
      ],
      vectorizerId: 101,
      vectorStorageId: 202,
      documentId: "33333333-3333-4333-8333-333333333333",
    });
    expect(result).toEqual({
      translationIds: [88],
      memoryItemIds: [99],
    });
  });

  it("submits translations even when vector services are unavailable", async () => {
    mocked.executeQuery
      .mockResolvedValueOnce({
        value: "Prompt",
        languageId: "en-US",
        projectId: "project-1",
        documentId: "33333333-3333-4333-8333-333333333333",
        chunkIds: [1],
      })
      .mockResolvedValueOnce({
        id: "zh-CN",
      })
      .mockResolvedValueOnce([
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
      ]);
    mocked.resolvePluginManager.mockReturnValue({ tag: "plugin-manager" });
    mocked.firstOrGivenService.mockReturnValue(undefined);
    mocked.createTranslationOp.mockResolvedValue({
      translationIds: [108],
      memoryItemIds: [209],
    });

    const result = await submitTranslationTool.execute(
      { elementId: 10, text: "提示" },
      createCtx(),
    );

    expect(mocked.createTranslationOp).toHaveBeenCalledWith({
      data: [
        {
          translatableElementId: 10,
          text: "提示",
          languageId: "zh-CN",
        },
      ],
      translatorId: null,
      memoryIds: [
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
      ],
      vectorizerId: undefined,
      vectorStorageId: undefined,
      documentId: "33333333-3333-4333-8333-333333333333",
    });
    expect(result).toEqual({
      translationIds: [108],
      memoryItemIds: [209],
    });
  });

  it("surfaces a semantic error when the requested target language does not exist", async () => {
    mocked.executeQuery
      .mockResolvedValueOnce({
        value: "Prompt",
        languageId: "en-US",
        projectId: "project-1",
        documentId: "33333333-3333-4333-8333-333333333333",
        chunkIds: [1],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([{ id: "zh-Hans" }, { id: "ja" }]);

    await expect(
      submitTranslationTool.execute(
        { elementId: 10, text: "提示" },
        createCtx(),
      ),
    ).rejects.toThrow(
      'submit_translation target language "zh-CN" from the current session does not exist in the language registry. No implicit fallback will be applied. Available project target languages: zh-Hans, ja.',
    );
    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      2,
      { db: { tag: "db" } },
      mocked.getLanguage,
      { languageId: "zh-CN" },
    );
    expect(mocked.executeQuery).toHaveBeenNthCalledWith(
      3,
      { db: { tag: "db" } },
      mocked.getProjectTargetLanguages,
      { projectId: "project-1" },
    );
    expect(mocked.createTranslationOp).not.toHaveBeenCalled();
  });

  describe("scope validation", () => {
    it("rejects get_documents when projectId does not match session", async () => {
      await expect(
        getDocumentsTool.execute(
          { projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
          createCtx(),
        ),
      ).rejects.toThrow("does not match the session project");
    });

    it("rejects list_elements when documentId belongs to a different project", async () => {
      mocked.executeQuery.mockResolvedValueOnce({
        id: "33333333-3333-4333-8333-333333333333",
        projectId: "other-project",
      });

      await expect(
        listElementsTool.execute(
          { documentId: "33333333-3333-4333-8333-333333333333" },
          createCtx(),
        ),
      ).rejects.toThrow("different project");
    });

    it("rejects list_elements when documentId does not match session", async () => {
      await expect(
        listElementsTool.execute(
          { documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
          createCtx(),
        ),
      ).rejects.toThrow("does not match the session document");
    });

    it("rejects get_neighbors when element belongs to a different project", async () => {
      mocked.executeQuery.mockResolvedValueOnce({
        value: "Hello",
        languageId: "en-US",
        projectId: "other-project",
        documentId: "other-doc",
        chunkIds: [],
      });

      await expect(
        getNeighborsTool.execute({ elementId: 99 }, createCtx()),
      ).rejects.toThrow("different project");
    });

    it("rejects get_translations when element belongs to a different document", async () => {
      mocked.executeQuery.mockResolvedValueOnce({
        value: "Hello",
        languageId: "en-US",
        projectId: "project-1",
        documentId: "other-doc-id",
        chunkIds: [],
      });

      await expect(
        getTranslationsTool.execute({ elementId: 5 }, createCtx()),
      ).rejects.toThrow("different document");
    });

    it("rejects submit_translation when element belongs to a different project", async () => {
      mocked.executeQuery.mockResolvedValueOnce({
        value: "Hello",
        languageId: "en-US",
        projectId: "other-project",
        documentId: "33333333-3333-4333-8333-333333333333",
        chunkIds: [],
      });

      await expect(
        submitTranslationTool.execute(
          { elementId: 5, text: "你好" },
          createCtx(),
        ),
      ).rejects.toThrow("different project");
    });
  });
});
