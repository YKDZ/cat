import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  deduplicateAndMatchOp: vi.fn(),
  llmTermEnhanceOp: vi.fn(),
  loadElementTextsOp: vi.fn(),
  statisticalTermExtractOp: vi.fn(),
}));

vi.mock("@cat/operations", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/operations")>("@cat/operations");

  return {
    ...actual,
    deduplicateAndMatchOp: mocks.deduplicateAndMatchOp,
    llmTermEnhanceOp: mocks.llmTermEnhanceOp,
    loadElementTextsOp: mocks.loadElementTextsOp,
    statisticalTermExtractOp: mocks.statisticalTermExtractOp,
  };
});

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/dsl";

import { termDiscoveryGraph } from "../term-discovery";

describe("termDiscoveryGraph", () => {
  let cleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const db = await setupTestDB();
    cleanup = db.cleanup;

    PluginManager.clear();
    const pluginManager = PluginManager.get(
      "GLOBAL",
      "term-discovery-test",
      new TestPluginLoader(),
    );
    await pluginManager.getDiscovery().syncDefinitions(db.client);
    createDefaultGraphRuntime(db.client, pluginManager);
  });

  afterAll(async () => {
    await cleanup?.();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadElementTextsOp.mockResolvedValue({
      elements: [{ elementId: 1, text: "Running cat", languageId: "en" }],
    });
    mocks.statisticalTermExtractOp.mockResolvedValue({
      candidates: [
        {
          text: "Running cat",
          normalizedText: "run cat",
          confidence: 0.82,
          frequency: 2,
          documentFrequency: 1,
          posPattern: ["VERB", "NOUN"],
          occurrences: [{ elementId: 1, ranges: [{ start: 0, end: 11 }] }],
        },
      ],
      nlpSegmenterUsed: "plugin",
    });
    mocks.deduplicateAndMatchOp.mockResolvedValue({
      candidates: [
        {
          text: "Running cat",
          normalizedText: "run cat",
          confidence: 0.82,
          frequency: 2,
          documentFrequency: 1,
          posPattern: ["VERB", "NOUN"],
          occurrences: [{ elementId: 1, ranges: [{ start: 0, end: 11 }] }],
          source: "statistical",
          existsInGlossary: false,
          existingConceptId: null,
        },
      ],
    });
    mocks.llmTermEnhanceOp.mockResolvedValue({
      candidates: [
        {
          text: "Running cat",
          normalizedText: "run cat",
          confidence: 0.82,
          frequency: 2,
          documentFrequency: 1,
          posPattern: ["VERB", "NOUN"],
          occurrences: [{ elementId: 1, ranges: [{ start: 0, end: 11 }] }],
          source: "statistical",
          existsInGlossary: false,
          existingConceptId: null,
          definition: null,
          subjects: null,
        },
      ],
      llmCandidatesAdded: 0,
    });
  });

  it("passes nlpSegmenterId through to statistical extraction", async () => {
    const result = await runGraph(termDiscoveryGraph, {
      documentIds: ["33333333-3333-4333-8333-333333333333"],
      glossaryId: "11111111-1111-4111-8111-111111111111",
      sourceLanguageId: "en",
      nlpSegmenterId: 77,
      config: {
        llm: { enabled: false },
      },
    });

    expect(mocks.statisticalTermExtractOp).toHaveBeenCalledWith(
      expect.objectContaining({
        nlpSegmenterId: 77,
      }),
      expect.any(Object),
    );
    expect(result.stats.nlpSegmenterUsed).toBe("plugin");
  });
});
