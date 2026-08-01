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

import { createDefaultGraphRuntime } from "#/graph/index.ts";

import { termDiscoveryGraph } from "../term-discovery.ts";

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
          elementFrequency: 1,
          posPattern: ["VERB", "NOUN"],
          occurrences: [{ elementId: 1, ranges: [{ start: 0, end: 11 }] }],
        },
      ],
    });
    mocks.deduplicateAndMatchOp.mockResolvedValue({
      candidates: [
        {
          text: "Running cat",
          normalizedText: "run cat",
          confidence: 0.82,
          frequency: 2,
          elementFrequency: 1,
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
          elementFrequency: 1,
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

  it("does not expose a per-call Language Analyzer override", () => {
    expect("languageAnalyzer" in termDiscoveryGraph.inputSchema.shape).toBe(
      false,
    );
  });
});
