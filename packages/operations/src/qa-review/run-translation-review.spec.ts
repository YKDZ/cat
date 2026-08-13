import { PluginManager } from "@cat/plugin-core";
import { QaReviewProfileConfigSchema } from "@cat/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const domainMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  executeQuery: vi.fn(),
  getDbHandle: vi.fn(),
}));

const semanticMocks = vi.hoisted(() => ({
  runSemanticQaReview: vi.fn(),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return { ...actual, ...domainMocks };
});

vi.mock("./semantic-review.ts", () => semanticMocks);

describe("runQaReviewForTranslationOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainMocks.getDbHandle.mockResolvedValue({ client: {} });
    domainMocks.executeQuery.mockResolvedValue({
      profileId: 7,
      config: QaReviewProfileConfigSchema.parse({
        enabledLayers: { deterministic: true, semantic: true },
      }),
    });
    domainMocks.executeCommand.mockResolvedValue({ queueItemId: 41 });
    semanticMocks.runSemanticQaReview.mockResolvedValue({
      status: "SKIPPED",
      modelService: null,
      summary: "No LLM provider available",
      errorMessage: null,
      findings: [],
    });
  });

  it("preserves a plugin manager created by another module instance", async () => {
    const manager = new PluginManager("GLOBAL", "");
    vi.resetModules();
    const { runQaReviewForTranslationOp } =
      await import("./run-translation-review.ts");

    await expect(
      runQaReviewForTranslationOp(
        {
          projectId: "11111111-1111-4111-8111-111111111111",
          elementId: 1,
          translationId: 2,
          languageId: "zh-Hans",
          sourceText: "Source",
          translationText: "Translation",
          qaResultId: 3,
          qaResultItemIds: [],
          qaItems: [],
        },
        { traceId: "cross-module-plugin-manager", pluginManager: manager },
      ),
    ).resolves.toEqual({ queueItemId: 41 });

    expect(semanticMocks.runSemanticQaReview).toHaveBeenCalledWith(
      expect.objectContaining({ pluginManager: manager }),
    );
  });
});
