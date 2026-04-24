import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecallFixture } from "./testing/recall-fixture-schema";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  getDbHandle: vi.fn(async () => ({ client: {} })),
  searchMemoryOp: vi.fn(),
  tokenizeOp: vi.fn(),
  listExactMemorySuggestions: Symbol("listExactMemorySuggestions"),
  listTrgmMemorySuggestions: Symbol("listTrgmMemorySuggestions"),
  listVariantMemorySuggestions: Symbol("listVariantMemorySuggestions"),
  listBm25MemorySuggestions: Symbol("listBm25MemorySuggestions"),
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
    listBm25MemorySuggestions: mocks.listBm25MemorySuggestions,
  };
});

vi.mock("./search-memory", () => ({
  searchMemoryOp: mocks.searchMemoryOp,
}));

vi.mock("./tokenize", () => ({
  tokenizeOp: mocks.tokenizeOp,
}));

import { collectMemoryRecallOp } from "./collect-memory-recall";
import { RecallFixtureSchema } from "./testing/recall-fixture-schema";

const FIXTURE_DIR = fileURLToPath(
  new URL("./__fixtures__/recall", import.meta.url),
);
const MEMORY_ID = "22222222-2222-4222-8222-222222222222";

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
      if (query === mocks.listBm25MemorySuggestions) {
        return reviveMemoryRows(memoryMock?.bm25 ?? []).map((row) => ({
          ...row,
          rawScore: row.confidence,
        }));
      }
      return [];
    });

    mocks.searchMemoryOp.mockResolvedValue({
      memories: reviveMemoryRows(memoryMock?.semantic ?? []),
    });
    mocks.tokenizeOp.mockResolvedValue({
      tokens: memoryMock?.queryTokens ?? [],
    });

    const result = await collectMemoryRecallOp(
      {
        text: fixture.query.text,
        sourceLanguageId: fixture.query.sourceLanguageId,
        translationLanguageId: fixture.query.translationLanguageId,
        memoryIds: [MEMORY_ID],
        chunkIds: [1],
        queryVectors: [[0.1, 0.2]],
        vectorStorageId: 1,
        maxAmount: 10,
      },
      { traceId: "memory-recall-regression" },
    );

    const top = result[0];
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

    const resultIds = new Set(result.map((item) => item.id));
    for (const missId of fixture.expected.missIds) {
      expect(resultIds.has(missId)).toBe(false);
    }

    if (fixture.expected.expectedTier) {
      const tierDecision = (
        top as { rankingDecisions?: Array<{ action: string; tier?: string }> }
      )?.rankingDecisions?.find((d) => d.action === "tier-assigned");
      expect(tierDecision?.tier).toBe(fixture.expected.expectedTier);
    }
  });
});
