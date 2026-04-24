import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectLLMResponse: vi.fn(),
  firstOrGivenService: vi.fn(),
  resolvePluginManager: vi.fn(),
}));

vi.mock("@cat/server-shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/server-shared")>(
      "@cat/server-shared",
    );
  return {
    ...actual,
    collectLLMResponse: mocks.collectLLMResponse,
    firstOrGivenService: mocks.firstOrGivenService,
    resolvePluginManager: mocks.resolvePluginManager,
  };
});

import { deriveSmartSuggestConfidence, smartSuggestOp } from "./smart-suggest";

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

const BASE_INPUT = {
  sourceText: "Click to confirm",
  sourceLanguageId: "en",
  targetLanguageId: "zh-Hans",
  memories: [],
  terms: [],
  neighborTranslations: [],
};

describe("deriveSmartSuggestConfidence", () => {
  it("returns 0.50 with no memories, terms, or neighbors", () => {
    expect(deriveSmartSuggestConfidence([], [], [])).toBe(0.5);
  });

  it("returns 0.53 with terms but no memory", () => {
    const terms = [{ term: "click", translation: "点击", definition: null }];
    expect(deriveSmartSuggestConfidence([], terms, [])).toBe(0.53);
  });

  it("returns 0.82 with strong memory (≥ 0.9)", () => {
    const memories = [
      {
        source: "Click to confirm",
        translation: "点击确认",
        confidence: 0.95,
      },
    ];
    expect(deriveSmartSuggestConfidence(memories, [], [])).toBe(0.82);
  });

  it("returns 0.68 with medium memory (≥ 0.7)", () => {
    const memories = [
      {
        source: "Click here to confirm",
        translation: "点击此处确认",
        confidence: 0.78,
      },
    ];
    expect(deriveSmartSuggestConfidence(memories, [], [])).toBe(0.68);
  });

  it("caps at 0.85 regardless of multiple signal boosts", () => {
    const memories = [{ source: "x", translation: "y", confidence: 1.0 }];
    const terms = [{ term: "x", translation: "y", definition: null }];
    const neighbors = [{ source: "a", translation: "b" }];
    expect(
      deriveSmartSuggestConfidence(memories, terms, neighbors),
    ).toBeLessThanOrEqual(0.85);
  });
});

describe("smartSuggestOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePluginManager.mockReturnValue({});
  });

  it("returns null when no LLM provider is available", async () => {
    mocks.firstOrGivenService.mockReturnValue(null);

    const result = await smartSuggestOp(BASE_INPUT);

    expect(result.suggestion).toBeNull();
  });

  it("returns null when the LLM call throws", async () => {
    mocks.firstOrGivenService.mockReturnValue(mockLlmService);
    mocks.collectLLMResponse.mockRejectedValue(new Error("LLM timeout"));

    const result = await smartSuggestOp(BASE_INPUT);

    expect(result.suggestion).toBeNull();
  });

  it("returns null when LLM returns empty content", async () => {
    mocks.firstOrGivenService.mockReturnValue(mockLlmService);
    mocks.collectLLMResponse.mockResolvedValue({ content: "   " });

    const result = await smartSuggestOp(BASE_INPUT);

    expect(result.suggestion).toBeNull();
  });

  it("returns a suggestion with source-only signal class when no memory or terms", async () => {
    mocks.firstOrGivenService.mockReturnValue(mockLlmService);
    mocks.collectLLMResponse.mockResolvedValue({ content: "点击以确认" });

    const result = await smartSuggestOp(BASE_INPUT);

    expect(result.suggestion).not.toBeNull();
    expect(result.suggestion?.translation).toBe("点击以确认");
    expect(result.suggestion?.confidence).toBe(0.5);
    expect(result.suggestion?.meta?.source).toBe("smart-suggestion");
    expect(result.suggestion?.meta?.signalClasses).toEqual(["source"]);
  });

  it("includes memory and term signal classes when both are present", async () => {
    mocks.firstOrGivenService.mockReturnValue(mockLlmService);
    mocks.collectLLMResponse.mockResolvedValue({ content: "点击以确认" });

    const result = await smartSuggestOp({
      ...BASE_INPUT,
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
    expect(result.suggestion?.meta?.signalClasses).toContain("source");
    expect(result.suggestion?.meta?.signalClasses).not.toContain("context");
  });

  it("includes context signal class when neighborTranslations are present", async () => {
    mocks.firstOrGivenService.mockReturnValue(mockLlmService);
    mocks.collectLLMResponse.mockResolvedValue({ content: "点击以确认" });

    const result = await smartSuggestOp({
      ...BASE_INPUT,
      neighborTranslations: [{ source: "Next step", translation: "下一步" }],
    });

    expect(result.suggestion?.meta?.signalClasses).toContain("context");
  });

  it("uses adaptedTranslation from memory when available", async () => {
    mocks.firstOrGivenService.mockReturnValue(mockLlmService);
    mocks.collectLLMResponse.mockResolvedValue({ content: "点击以确认" });

    await smartSuggestOp({
      ...BASE_INPUT,
      memories: [
        {
          source: "Click to confirm order 42",
          translation: "点击确认订单 42",
          adaptedTranslation: "点击确认订单 43",
          confidence: 0.88,
        },
      ],
    });

    // The user prompt passed to the LLM should use adaptedTranslation
    expect(mocks.collectLLMResponse).toHaveBeenCalledOnce();
    // oxlint-disable-next-line no-unsafe-type-assertion
    const chatArgs = mockLlmService.service.chat.mock
      .calls[0]?.[0] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPrompt: string = chatArgs.messages[1].content;
    expect(userPrompt).toContain("点击确认订单 43"); // adaptedTranslation used
    expect(userPrompt).not.toContain("点击确认订单 42"); // raw translation NOT used
  });
});
