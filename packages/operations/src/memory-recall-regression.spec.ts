import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecallFixture } from "./testing/recall-fixture-schema.ts";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  getDbHandle: vi.fn(async () => ({
    client: {
      transaction: async (
        run: (tx: Record<string, never>) => Promise<unknown>,
      ) => await run({}),
    },
  })),
  searchMemoryOp: vi.fn(),
  tokenizeOp: vi.fn(),
  probeMemoryRecallDependency: vi.fn(),
  listExactMemorySuggestions: Symbol("listExactMemorySuggestions"),
  listTrgmMemorySuggestions: Symbol("listTrgmMemorySuggestions"),
  listVariantMemorySuggestions: Symbol("listVariantMemorySuggestions"),
  listTemplateMemorySuggestions: Symbol("listTemplateMemorySuggestions"),
  listKeywordMemorySuggestions: Symbol("listKeywordMemorySuggestions"),
  listScopedMemoryRecallDerivationStates: Symbol(
    "listScopedMemoryRecallDerivationStates",
  ),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");

  return {
    ...actual,
    executeQuery: mocks.executeQuery,
    getDbHandle: mocks.getDbHandle,
    listExactMemorySuggestions: mocks.listExactMemorySuggestions,
    listTrgmMemorySuggestions: mocks.listTrgmMemorySuggestions,
    listVariantMemorySuggestions: mocks.listVariantMemorySuggestions,
    listTemplateMemorySuggestions: mocks.listTemplateMemorySuggestions,
    listKeywordMemorySuggestions: mocks.listKeywordMemorySuggestions,
    listScopedMemoryRecallDerivationStates:
      mocks.listScopedMemoryRecallDerivationStates,
  };
});

vi.mock("./search-memory.ts", () => ({
  searchMemoryOp: mocks.searchMemoryOp,
}));

vi.mock("./tokenize.ts", () => ({
  tokenizeOp: mocks.tokenizeOp,
}));

vi.mock("./memory-recall-derivation.ts", () => ({
  probeMemoryRecallDependency: mocks.probeMemoryRecallDependency,
}));

import {
  CollectMemoryRecallInputSchema,
  collectMemoryRecallOp,
  getMemoryRecallCandidates,
} from "./collect-memory-recall.ts";
import { RecallFixtureSchema } from "./testing/recall-fixture-schema.ts";

const FIXTURE_DIR = fileURLToPath(
  new URL("./__fixtures__/recall", import.meta.url),
);
const MEMORY_ID = "22222222-2222-4222-8222-222222222222";
const vectorStorage = ServiceImplementationReferenceSchema.parse({
  pluginId: "test-plugin",
  serviceId: "vector-storage",
  serviceType: "VECTOR_STORAGE",
  scopeType: "GLOBAL",
  scopeId: "",
});

type MemoryFixtureRows = NonNullable<RecallFixture["mock"]["memory"]>["exact"];

const reviveMemoryRows = (rows: MemoryFixtureRows) =>
  rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));

const loadFixtures = (): RecallFixture[] =>
  readdirSync(FIXTURE_DIR)
    .filter((name) => name.startsWith("memory-") && name.endsWith(".json"))
    .map((name) =>
      RecallFixtureSchema.parse(
        JSON.parse(readFileSync(`${FIXTURE_DIR}/${name}`, "utf8")),
      ),
    );

describe("memory recall regression fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      sourceLanguageAnalysisTokens: [],
    },
    {
      sourceLanguageAnalysisVersion: `sha256:${"a".repeat(64)}`,
    },
  ])("rejects an incomplete Language Analysis snapshot %#", (snapshot) => {
    expect(() =>
      CollectMemoryRecallInputSchema.parse({
        text: "Order completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [MEMORY_ID],
        ...snapshot,
      }),
    ).toThrow("Language Analysis tokens and version must be supplied together");
  });

  it("blocks a Candidate Channel atomically when a later internal lane fails", async () => {
    mocks.probeMemoryRecallDependency.mockResolvedValue({
      requiredDerivationVersion: `sha256:${"d".repeat(64)}`,
    });
    mocks.tokenizeOp.mockResolvedValue({
      tokens: [{ type: "text", value: "running", start: 0, end: 7 }],
    });
    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === mocks.listScopedMemoryRecallDerivationStates) {
        return [
          {
            targetId: "42",
            stateId: 1,
            languageId: "en",
            status: "FRESH",
            demandRevision: 1,
            blocker: null,
            canonicalInputVersion: `sha256:${"c".repeat(64)}`,
            requiredDerivationVersion: `sha256:${"d".repeat(64)}`,
            currentCanonicalInputVersion: `sha256:${"c".repeat(64)}`,
            currentDerivationVersion: `sha256:${"d".repeat(64)}`,
          },
        ];
      }
      if (query === mocks.listVariantMemorySuggestions) {
        return [
          {
            id: 42,
            translationId: null,
            memoryId: MEMORY_ID,
            creatorId: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            source: "running",
            translation: "running translation",
            translationChunkSetId: null,
            sourceTemplate: null,
            translationTemplate: null,
            slotMapping: null,
            confidence: 0.9,
            matchedVariantText: "run",
            matchedVariantType: "LEMMA",
            evidences: [
              {
                channel: "morphological",
                confidence: 0.9,
                matchedVariantText: "run",
                matchedVariantType: "LEMMA",
              },
            ],
          },
        ];
      }
      if (query === mocks.listTemplateMemorySuggestions) {
        throw new Error("template lane unavailable");
      }
      return [];
    });

    await expect(
      collectMemoryRecallOp({
        text: "running",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [MEMORY_ID],
        channels: ["VARIANT"],
        sourceLanguageAnalysisTokens: [
          {
            text: "running",
            lemma: "run",
            pos: "VERB",
            start: 0,
            end: 7,
            isStop: false,
            isPunct: false,
          },
        ],
        sourceLanguageAnalysisVersion: `sha256:${"a".repeat(64)}`,
      }),
    ).rejects.toMatchObject({
      recallResult: {
        outcomes: {
          VARIANT: {
            status: "BLOCKED",
            blocker: { reason: "CHANNEL_EXECUTION_FAILED" },
          },
        },
      },
    });
  });

  it.each(loadFixtures())("$name", async (fixture) => {
    const memoryMock = fixture.mock.memory;
    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === mocks.listExactMemorySuggestions) {
        return reviveMemoryRows(memoryMock?.exact ?? []);
      }
      if (query === mocks.listTrgmMemorySuggestions) {
        return reviveMemoryRows(memoryMock?.trgm ?? []);
      }
      if (query === mocks.listVariantMemorySuggestions) {
        return reviveMemoryRows(memoryMock?.variant ?? []);
      }
      if (query === mocks.listKeywordMemorySuggestions) {
        return reviveMemoryRows(memoryMock?.keyword ?? []);
      }
      if (query === mocks.listScopedMemoryRecallDerivationStates) {
        return [
          {
            targetId: "1",
            stateId: 1,
            languageId: fixture.query.sourceLanguageId,
            status: "FRESH",
            demandRevision: 1,
            blocker: null,
            canonicalInputVersion: `sha256:${"c".repeat(64)}`,
            requiredDerivationVersion: `sha256:${"d".repeat(64)}`,
            currentCanonicalInputVersion: `sha256:${"c".repeat(64)}`,
            currentDerivationVersion: `sha256:${"d".repeat(64)}`,
          },
        ];
      }
      return [];
    });

    mocks.searchMemoryOp.mockResolvedValue({
      memories: reviveMemoryRows(memoryMock?.semantic ?? []),
    });
    mocks.tokenizeOp.mockResolvedValue({
      tokens: memoryMock?.queryTokens ?? [],
    });
    mocks.probeMemoryRecallDependency.mockResolvedValue({
      requiredDerivationVersion: `sha256:${"d".repeat(64)}`,
      languageAnalysisVersion: `sha256:${"a".repeat(64)}`,
      tokens: fixture.query.text.split(/\s+/).map((text, index) => ({
        text,
        lemma: text.toLowerCase(),
        pos: "NOUN",
        start: index,
        end: index + text.length,
        isStop: false,
        isPunct: false,
      })),
      reconciliation: { invalidated: 0, pendingUpdated: 0 },
    });

    const result = await collectMemoryRecallOp(
      {
        text: fixture.query.text,
        sourceLanguageId: fixture.query.sourceLanguageId,
        translationLanguageId: fixture.query.translationLanguageId,
        memoryIds: [MEMORY_ID],
        chunkIds: [1],
        queryVectors: [[0.1, 0.2]],
        vectorStorage,
        maxAmount: 10,
      },
      { traceId: "memory-recall-regression" },
    );

    const candidates = getMemoryRecallCandidates(result);
    const top = candidates[0];
    expect(top?.id).toBe(fixture.expected.topId);
    expect(top?.confidence ?? 0).toBeGreaterThanOrEqual(
      fixture.expected.minimumTopConfidence,
    );

    const evidenceChannels = new Set<string>(
      top?.evidences.map((e) => e.channel) ?? [],
    );
    for (const channel of fixture.expected.requiredChannels) {
      expect(evidenceChannels.has(channel)).toBe(true);
    }

    const matchedVariantTypes = new Set(
      top?.evidences
        .map((e) => e.matchedVariantType)
        .filter((value): value is string => value !== undefined) ?? [],
    );
    for (const variantType of fixture.expected.requiredVariantTypes) {
      expect(matchedVariantTypes.has(variantType)).toBe(true);
    }

    if (fixture.expected.expectedTranslation) {
      expect(top && (top.adaptedTranslation ?? top.translation)).toBe(
        fixture.expected.expectedTranslation,
      );
    }

    const resultIds = new Set(candidates.map((item) => item.id));
    for (const missId of fixture.expected.missIds) {
      expect(resultIds.has(missId)).toBe(false);
    }

    if (fixture.expected.expectedTier) {
      const tierDecision = top?.rankingDecisions?.find(
        (decision) => decision.action === "tier-assigned",
      );
      expect(tierDecision?.tier).toBe(fixture.expected.expectedTier);
    }
  });
});
