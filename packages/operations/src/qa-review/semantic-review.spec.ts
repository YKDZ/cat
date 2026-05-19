import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
  collectLLMResponse: vi.fn(),
  firstOrGivenService: vi.fn(),
}));

vi.mock("@cat/server-shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/server-shared")>(
      "@cat/server-shared",
    );
  return {
    ...actual,
    collectLLMResponse: serverMocks.collectLLMResponse,
    firstOrGivenService: serverMocks.firstOrGivenService,
  };
});

import { PluginManager } from "@cat/plugin-core";
import { QaReviewProfileConfigSchema } from "@cat/shared";

import { runSemanticQaReview } from "./semantic-review";

const mockLlmService = {
  id: 7,
  service: {
    chat: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        /* empty */
      },
    }),
  },
};

const baseProfile = QaReviewProfileConfigSchema.parse({
  enabledLayers: { deterministic: true, semantic: true },
  llm: {
    providerServiceId: 7,
    maxTokens: 800,
    temperature: 0,
    minRiskScoreForQueue: 40,
  },
  rules: [],
});

const mockPluginManager = new PluginManager("GLOBAL", "");

describe("runSemanticQaReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when semantic review is disabled", async () => {
    const result = await runSemanticQaReview({
      projectId: "11111111-1111-4111-8111-111111111111",
      elementId: 1,
      translationId: 2,
      sourceText: "Click to confirm",
      translationText: "点击确认",
      profile: QaReviewProfileConfigSchema.parse({
        enabledLayers: { deterministic: true, semantic: false },
      }),
    });

    expect(result.status).toBe("SKIPPED");
    expect(result.summary).toBe("Semantic review disabled");
    expect(serverMocks.firstOrGivenService).not.toHaveBeenCalled();
  });

  it("skips when no provider is available", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(null);

    const result = await runSemanticQaReview({
      projectId: "11111111-1111-4111-8111-111111111111",
      elementId: 1,
      translationId: 2,
      sourceText: "Click to confirm",
      translationText: "点击确认",
      profile: baseProfile,
      pluginManager: mockPluginManager,
    });

    expect(result.status).toBe("SKIPPED");
    expect(result.summary).toBe("No LLM provider available");
    expect(result.findings).toEqual([]);
  });

  it("parses valid semantic findings and never escalates them to BLOCK_APPROVAL", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({
      content: JSON.stringify({
        summary: "Potential meaning drift detected",
        findings: [
          {
            ruleId: "semantic.meaning-drift",
            ruleFamily: "meaning",
            severity: "warning",
            confidenceBasisPoints: 8200,
            riskScore: 75,
            message: "The translation may soften the original intent",
            explanation: "Tone changed from imperative to suggestive",
            targetSpan: {
              textRange: { start: 0, end: 2 },
              quote: "点击",
            },
            suggestedText: "请点击",
          },
        ],
      }),
    });

    const result = await runSemanticQaReview({
      projectId: "11111111-1111-4111-8111-111111111111",
      elementId: 1,
      translationId: 2,
      sourceText: "Click to confirm",
      translationText: "点击确认",
      profile: baseProfile,
      pluginManager: mockPluginManager,
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.modelServiceId).toBe(7);
    expect(result.summary).toBe("Potential meaning drift detected");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.layer).toBe("SEMANTIC");
    expect(result.findings[0]?.action).toBe("NEEDS_REVIEW");
    expect(result.findings[0]?.action).not.toBe("BLOCK_APPROVAL");
  });

  it("fails gracefully when provider output is invalid JSON", async () => {
    serverMocks.firstOrGivenService.mockReturnValue(mockLlmService);
    serverMocks.collectLLMResponse.mockResolvedValue({
      content: "definitely not valid json",
    });

    const result = await runSemanticQaReview({
      projectId: "11111111-1111-4111-8111-111111111111",
      elementId: 1,
      translationId: 2,
      sourceText: "Click to confirm",
      translationText: "点击确认",
      profile: baseProfile,
      pluginManager: mockPluginManager,
    });

    expect(result.status).toBe("FAILED");
    expect(result.findings).toEqual([]);
    expect(result.errorMessage).toBeTruthy();
  });
});
