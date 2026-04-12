import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecallFixture } from "./testing/recall-fixture-schema";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  getDbHandle: vi.fn(async () => ({ client: {} })),
  nlpSegmentOp: vi.fn(),
  semanticSearchTermsOp: vi.fn(),
  listLexicalTermSuggestions: Symbol("listLexicalTermSuggestions"),
  listMorphologicalTermSuggestions: Symbol("listMorphologicalTermSuggestions"),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");

  return {
    ...actual,
    executeQuery: mocks.executeQuery,
    getDbHandle: mocks.getDbHandle,
    listLexicalTermSuggestions: mocks.listLexicalTermSuggestions,
    listMorphologicalTermSuggestions: mocks.listMorphologicalTermSuggestions,
  };
});

vi.mock("./nlp-segment", () => ({
  nlpSegmentOp: mocks.nlpSegmentOp,
}));

vi.mock("./semantic-search-terms", () => ({
  semanticSearchTermsOp: mocks.semanticSearchTermsOp,
}));

import { collectTermRecallOp } from "./collect-term-recall";
import { RecallFixtureSchema } from "./testing/recall-fixture-schema";

const FIXTURE_DIR = fileURLToPath(
  new URL("./__fixtures__/recall", import.meta.url),
);
const GLOSSARY_ID = "11111111-1111-4111-8111-111111111111";

const loadFixtures = (): RecallFixture[] =>
  readdirSync(FIXTURE_DIR)
    .filter((name) => name.startsWith("term-") && name.endsWith(".json"))
    .map((name) =>
      RecallFixtureSchema.parse(
        JSON.parse(readFileSync(`${FIXTURE_DIR}/${name}`, "utf8")),
      ),
    );

describe("term recall regression fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(loadFixtures())("$name", async (fixture) => {
    const termMock = fixture.mock.term;
    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === mocks.listLexicalTermSuggestions) {
        return termMock?.lexical ?? [];
      }
      if (query === mocks.listMorphologicalTermSuggestions) {
        return termMock?.morphological ?? [];
      }
      return [];
    });

    mocks.semanticSearchTermsOp.mockResolvedValue(termMock?.semantic ?? []);
    mocks.nlpSegmentOp.mockResolvedValue({
      tokens: termMock?.nlpTokens ?? [],
      sentences: [],
    });

    const result = await collectTermRecallOp(
      {
        glossaryIds: [GLOSSARY_ID],
        text: fixture.query.text,
        sourceLanguageId: fixture.query.sourceLanguageId,
        translationLanguageId: fixture.query.translationLanguageId,
        maxAmount: 10,
      },
      { traceId: "term-recall-regression" },
    );

    const top = result[0];
    expect(top?.conceptId).toBe(fixture.expected.topId);
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

    const resultIds = new Set(result.map((item) => item.conceptId));
    for (const missId of fixture.expected.missIds) {
      expect(resultIds.has(missId)).toBe(false);
    }
  });
});
