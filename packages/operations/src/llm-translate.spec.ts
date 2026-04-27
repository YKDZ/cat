import { beforeEach, describe, expect, it, vi } from "vitest";

const domainMocks = vi.hoisted(() => ({
  getElementInfo: vi.fn(),
  listNeighborElements: vi.fn(),
  listDocumentApprovedTranslations: vi.fn(),
  listElementComments: vi.fn(),
  getDbHandle: vi.fn(),
}));

const serverMocks = vi.hoisted(() => ({
  collectLLMResponse: vi.fn(),
  firstOrGivenService: vi.fn(),
  resolvePluginManager: vi.fn(),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return {
    ...actual,
    getElementInfo: domainMocks.getElementInfo,
    listNeighborElements: domainMocks.listNeighborElements,
    listDocumentApprovedTranslations:
      domainMocks.listDocumentApprovedTranslations,
    listElementComments: domainMocks.listElementComments,
    getDbHandle: domainMocks.getDbHandle,
  };
});

vi.mock("@cat/server-shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/server-shared")>(
      "@cat/server-shared",
    );
  return {
    ...actual,
    collectLLMResponse: serverMocks.collectLLMResponse,
    firstOrGivenService: serverMocks.firstOrGivenService,
    resolvePluginManager: serverMocks.resolvePluginManager,
  };
});

import { deriveLlmTranslateConfidence, llmTranslateOp } from "./llm-translate";

const mockLlmService = {
  id: 1,
  service: {
    chat: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        /* empty */
      },
    }),
  },
};

const MOCK_ELEMENT_INFO = {
  elementId: 10,
  documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceText: "Click to confirm",
  sourceLanguageId: "en",
  sortIndex: 1,
  contexts: [],
  meta: {},
  translations: [],
};

const MOCK_NEIGHBORS = [
  {
    id: 9,
    value: "Previous step",
    languageId: "en",
    approvedTranslation: "上一步",
    approvedTranslationLanguageId: "zh-Hans",
    offset: -1,
  },
];

const MOCK_APPROVED_TRANSLATIONS = [
  { source: "Save changes", translation: "保存更改", elementId: 11 },
];

const MOCK_COMMENTS = [
  {
    id: 1,
    authorId: "user-1",
    content: "This should use imperative mood",
    createdAt: new Date("2026-01-01"),
    children: [
      {
        id: 2,
        authorId: "user-2",
        content: "Agreed",
        createdAt: new Date("2026-01-02"),
      },
    ],
  },
];

describe("deriveLlmTranslateConfidence", () => {
  it("returns 0.50 with no signals", () => {
    expect(
      deriveLlmTranslateConfidence({
        memories: [],
        terms: [],
        sessionTranslationsCount: 0,
        neighborTranslationsCount: 0,
        elementContextsCount: 0,
        approvedTranslationsCount: 0,
        elementMeta: false,
        commentsCount: 0,
      }),
    ).toBe(0.5);
  });

  it("returns 0.53 with terms", () => {
    expect(
      deriveLlmTranslateConfidence({
        memories: [],
        terms: [{ term: "click", translation: "点击", definition: null }],
        sessionTranslationsCount: 0,
        neighborTranslationsCount: 0,
        elementContextsCount: 0,
        approvedTranslationsCount: 0,
        elementMeta: false,
        commentsCount: 0,
      }),
    ).toBe(0.53);
  });

  it("returns 0.82 with strong memory (>= 0.9)", () => {
    expect(
      deriveLlmTranslateConfidence({
        memories: [{ source: "x", translation: "y", confidence: 0.95 }],
        terms: [],
        sessionTranslationsCount: 0,
        neighborTranslationsCount: 0,
        elementContextsCount: 0,
        approvedTranslationsCount: 0,
        elementMeta: false,
        commentsCount: 0,
      }),
    ).toBe(0.82);
  });

  it("adds +0.01 per new context type", () => {
    const score = deriveLlmTranslateConfidence({
      memories: [],
      terms: [],
      sessionTranslationsCount: 0,
      neighborTranslationsCount: 1,
      elementContextsCount: 1,
      approvedTranslationsCount: 1,
      elementMeta: true,
      commentsCount: 1,
    });
    // base 0.50 + 0.02 (neighbor) + 0.01 + 0.01 + 0.01 + 0.01 = 0.56
    expect(score).toBe(0.56);
  });

  it("caps at 0.85", () => {
    expect(
      deriveLlmTranslateConfidence({
        memories: [{ source: "x", translation: "y", confidence: 1.0 }],
        terms: [{ term: "x", translation: "y", definition: null }],
        sessionTranslationsCount: 0,
        neighborTranslationsCount: 5,
        elementContextsCount: 5,
        approvedTranslationsCount: 5,
        elementMeta: true,
        commentsCount: 5,
      }),
    ).toBeLessThanOrEqual(0.85);
  });
});

describe("llmTranslateOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverMocks.resolvePluginManager.mockReturnValue({});
    domainMocks.getDbHandle.mockResolvedValue({ client: {} });
    domainMocks.getElementInfo.mockResolvedValue(MOCK_ELEMENT_INFO);
    domainMocks.listNeighborElements.mockResolvedValue(MOCK_NEIGHBORS);
    domainMocks.listDocumentApprovedTranslations.mockResolvedValue(
      MOCK_APPROVED_TRANSLATIONS,
    );
    domainMocks.listElementComments.mockResolvedValue(MOCK_COMMENTS);
  });

  const BASE_INPUT = {
    elementId: 10,
    targetLanguageId: "zh-Hans",
    config: {},
    memories: [],
    terms: [],
  };

  // --- Null / error cases ---

  it("returns null when no LLM provider is available", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(null);
    const result = await llmTranslateOp(BASE_INPUT);
    expect(result.suggestion).toBeNull();
  });

  it("returns null when LLM call throws", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockRejectedValue(new Error("LLM timeout"));
    const result = await llmTranslateOp(BASE_INPUT);
    expect(result.suggestion).toBeNull();
  });

  it("returns null when LLM returns empty content", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "   " });
    const result = await llmTranslateOp(BASE_INPUT);
    expect(result.suggestion).toBeNull();
  });

  it("returns null when element not found (getElementInfo throws)", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    domainMocks.getElementInfo.mockRejectedValue(
      new Error("Element not found"),
    );
    const result = await llmTranslateOp(BASE_INPUT);
    expect(result.suggestion).toBeNull();
  });

  // --- Successful generation ---

  it("returns a suggestion with source-only signal class when no other context", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "点击以确认" });
    // Disable all optional context
    domainMocks.listNeighborElements.mockResolvedValue([]);

    const result = await llmTranslateOp({
      ...BASE_INPUT,
      config: {
        neighborTranslations: false,
        elementContexts: { enabled: false },
        approvedTranslations: { enabled: false },
        comments: { enabled: false },
      },
    });

    expect(result.suggestion).not.toBeNull();
    expect(result.suggestion?.translation).toBe("点击以确认");
    expect(result.suggestion?.confidence).toBe(0.5);
    expect(result.suggestion?.meta?.source).toBe("llm-translate");
    expect(result.suggestion?.meta?.signalClasses).toEqual(["source"]);
  });

  it("includes all signal classes when context is present", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "点击以确认" });

    domainMocks.getElementInfo.mockResolvedValue({
      ...MOCK_ELEMENT_INFO,
      meta: { key: "confirm_button" },
      contexts: [
        {
          type: "TEXT" as const,
          jsonData: null,
          textData: "Button label",
          fileId: null,
          storageProviderId: null,
        },
      ],
    });

    const result = await llmTranslateOp({
      ...BASE_INPUT,
      config: {
        ...BASE_INPUT.config,
        comments: { enabled: true },
      },
      memories: [
        {
          source: "Click to confirm",
          translation: "点击确认",
          confidence: 0.92,
        },
      ],
      terms: [{ term: "confirm", translation: "确认", definition: null }],
    });

    expect(result.suggestion?.meta?.signalClasses).toContain("memory");
    expect(result.suggestion?.meta?.signalClasses).toContain("term");
    expect(result.suggestion?.meta?.signalClasses).toContain(
      "neighborTranslations",
    );
    expect(result.suggestion?.meta?.signalClasses).toContain("elementMeta");
    expect(result.suggestion?.meta?.signalClasses).toContain("elementContexts");
    expect(result.suggestion?.meta?.signalClasses).toContain(
      "approvedTranslations",
    );
    expect(result.suggestion?.meta?.signalClasses).toContain("comments");
    expect(result.suggestion?.meta?.signalClasses).toContain("source");
    expect(result.suggestion?.meta?.signalClasses).not.toContain("context");
  });

  // --- Config gating ---

  it("skips neighbor query when config.neighborTranslations is false", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "x" });

    await llmTranslateOp({
      ...BASE_INPUT,
      config: { neighborTranslations: false },
    });

    expect(domainMocks.listNeighborElements).not.toHaveBeenCalled();
  });

  it("skips approved translations query when config disables it", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "x" });

    await llmTranslateOp({
      ...BASE_INPUT,
      config: { approvedTranslations: { enabled: false } },
    });

    expect(domainMocks.listDocumentApprovedTranslations).not.toHaveBeenCalled();
  });

  it("skips comments query when config disables it", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "x" });

    await llmTranslateOp({
      ...BASE_INPUT,
      config: { comments: { enabled: false } },
    });

    expect(domainMocks.listElementComments).not.toHaveBeenCalled();
  });

  // --- Error resilience ---

  it("proceeds when an individual context query fails", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "x" });

    domainMocks.listDocumentApprovedTranslations.mockRejectedValue(
      new Error("DB timeout"),
    );

    const result = await llmTranslateOp(BASE_INPUT);
    expect(result.suggestion).not.toBeNull();
    // approvedTranslations should be omitted from signalClasses
    expect(result.suggestion?.meta?.signalClasses).not.toContain(
      "approvedTranslations",
    );
  });

  // --- Prompt content ---

  it("includes IMAGE/FILE context markers in prompt", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "x" });

    domainMocks.getElementInfo.mockResolvedValue({
      ...MOCK_ELEMENT_INFO,
      contexts: [
        {
          type: "IMAGE" as const,
          jsonData: { filename: "screenshot.png", width: 800, height: 600 },
          textData: null,
          fileId: 5,
          storageProviderId: 1,
        },
      ],
    });

    await llmTranslateOp(BASE_INPUT);

    // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    const chatArgs = mockLlmService.service.chat.mock
      .calls[0]?.[0] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPrompt = chatArgs?.messages[1]?.content ?? "";
    expect(userPrompt).toContain("[IMAGE context");
    expect(userPrompt).toContain("not visually processed");
  });

  it("uses adaptedTranslation from memory when available", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "x" });

    await llmTranslateOp({
      ...BASE_INPUT,
      memories: [
        {
          source: "Click to confirm",
          translation: "点击确认订单 42",
          adaptedTranslation: "点击确认订单 43",
          confidence: 0.88,
        },
      ],
    });

    // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    const chatArgs = mockLlmService.service.chat.mock
      .calls[0]?.[0] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPrompt = chatArgs?.messages[1]?.content ?? "";
    expect(userPrompt).toContain("点击确认订单 43");
    expect(userPrompt).not.toContain("点击确认订单 42");
  });

  // --- C1: Prompt includes target language ---

  it("includes target language in the user prompt", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "点击以确认" });

    await llmTranslateOp({
      ...BASE_INPUT,
      targetLanguageId: "zh-Hans",
    });

    // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    const chatArgs = mockLlmService.service.chat.mock
      .calls[0]?.[0] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPrompt = chatArgs?.messages[1]?.content ?? "";
    expect(userPrompt).toContain("to zh-Hans");
  });

  // --- W1: config.memory / config.term gate signalClasses and confidence ---

  it("excludes memory from signalClasses when config.memory is false", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "x" });

    const result = await llmTranslateOp({
      ...BASE_INPUT,
      config: {
        memory: false,
        neighborTranslations: false,
        elementContexts: { enabled: false },
        approvedTranslations: { enabled: false },
        comments: { enabled: false },
      },
      memories: [{ source: "Click", translation: "点击", confidence: 0.95 }],
    });

    expect(result.suggestion?.meta?.signalClasses).not.toContain("memory");
    expect(result.suggestion?.confidence).toBe(0.5);
  });

  it("excludes terms from signalClasses when config.term is false", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({ content: "x" });

    const result = await llmTranslateOp({
      ...BASE_INPUT,
      config: {
        term: false,
        neighborTranslations: false,
        elementContexts: { enabled: false },
        approvedTranslations: { enabled: false },
        comments: { enabled: false },
      },
      terms: [{ term: "confirm", translation: "确认", definition: null }],
    });

    expect(result.suggestion?.meta?.signalClasses).not.toContain("term");
    // Without term bonus: base 0.5, no other signals → 0.5
    expect(result.suggestion?.confidence).toBe(0.5);
  });
});
