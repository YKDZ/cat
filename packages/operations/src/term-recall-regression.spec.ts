import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
  semanticSearchTermsOp: vi.fn(),
  probeGlossaryRecallDependency: vi.fn(),
  listLexicalTermSuggestions: Symbol("listLexicalTermSuggestions"),
  listMorphologicalTermSuggestions: Symbol("listMorphologicalTermSuggestions"),
  listKeywordTermSuggestions: Symbol("listKeywordTermSuggestions"),
  listScopedTermRecallDerivationStates: Symbol(
    "listScopedTermRecallDerivationStates",
  ),
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
    listKeywordTermSuggestions: mocks.listKeywordTermSuggestions,
    listScopedTermRecallDerivationStates:
      mocks.listScopedTermRecallDerivationStates,
  };
});

vi.mock("./semantic-search-terms.ts", () => ({
  semanticSearchTermsOp: mocks.semanticSearchTermsOp,
}));

vi.mock("./glossary-recall-derivation.ts", () => ({
  probeGlossaryRecallDependency: mocks.probeGlossaryRecallDependency,
}));

import {
  CollectTermRecallInputSchema,
  collectTermRecallOp,
  getTermRecallCandidates,
} from "./collect-term-recall.ts";
import { RecallFixtureSchema } from "./testing/recall-fixture-schema.ts";

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

  it.each([
    { sourceLanguageAnalysisTokens: [] },
    { sourceLanguageAnalysisVersion: `sha256:${"a".repeat(64)}` },
  ])("rejects an incomplete Language Analysis snapshot %#", (snapshot) => {
    expect(() =>
      CollectTermRecallInputSchema.parse({
        glossaryIds: [GLOSSARY_ID],
        text: "Allay Spawn Egg",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        ...snapshot,
      }),
    ).toThrow("Language Analysis tokens and version must be supplied together");
  });

  it.each([
    {
      text: "use the allay spawn egg now",
      expectedStatus: "SUCCEEDED",
      expectedCandidates: 1,
    },
    {
      text: "allay spawn",
      expectedStatus: "EMPTY",
      expectedCandidates: 0,
    },
  ] as const)(
    "treats complete term occurrence as an applicable Exact outcome: $expectedStatus",
    async ({ text, expectedStatus, expectedCandidates }) => {
      mocks.executeQuery.mockResolvedValue([
        {
          term: "Allay Spawn Egg",
          translation: "Allay spawn egg translation",
          confidence: 0.95,
          definition: "Spawn egg for the Allay mob.",
          conceptId: 601,
          glossaryId: GLOSSARY_ID,
          matchedText: "Allay Spawn Egg",
          evidences: [
            {
              channel: "lexical",
              matchedText: "Allay Spawn Egg",
              confidence: 0.95,
            },
          ],
        },
      ]);

      const result = await collectTermRecallOp({
        glossaryIds: [GLOSSARY_ID],
        text,
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        channels: ["EXACT"],
      });

      expect(result.outcomes.EXACT.status).toBe(expectedStatus);
      expect(getTermRecallCandidates(result)).toHaveLength(expectedCandidates);
      if (result.outcomes.EXACT.status === "SUCCEEDED") {
        expect(result.outcomes.EXACT.candidates[0]?.evidences).toEqual([
          expect.objectContaining({ channel: "exact", confidence: 1 }),
        ]);
      }
    },
  );

  it("does not treat a short term inside a longer word as Exact", async () => {
    mocks.executeQuery.mockResolvedValue([
      {
        term: "cat",
        translation: "cat translation",
        confidence: 1,
        definition: null,
        conceptId: 602,
        glossaryId: GLOSSARY_ID,
        matchedText: "cat",
        evidences: [{ channel: "lexical", confidence: 1 }],
      },
    ]);

    const result = await collectTermRecallOp({
      glossaryIds: [GLOSSARY_ID],
      text: "concatenate the files",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      channels: ["EXACT"],
    });

    expect(result.outcomes.EXACT).toEqual({ status: "EMPTY" });
    expect(getTermRecallCandidates(result)).toEqual([]);
  });

  it("finds an Exact term occurrence in a language without spaces", async () => {
    mocks.executeQuery.mockResolvedValue([
      {
        term: "内存",
        translation: "memory",
        confidence: 1,
        definition: null,
        conceptId: 603,
        glossaryId: GLOSSARY_ID,
        matchedText: "内存",
        evidences: [{ channel: "lexical", confidence: 1 }],
      },
    ]);

    const result = await collectTermRecallOp({
      glossaryIds: [GLOSSARY_ID],
      text: "请清理内存缓存",
      sourceLanguageId: "zh-Hans",
      translationLanguageId: "en",
      channels: ["EXACT"],
    });

    expect(result.outcomes.EXACT.status).toBe("SUCCEEDED");
    expect(getTermRecallCandidates(result)).toEqual([
      expect.objectContaining({ conceptId: 603 }),
    ]);
  });

  it("uses the source locale for case-insensitive Exact occurrence", async () => {
    mocks.executeQuery.mockResolvedValue([
      {
        term: "İÇERİK",
        translation: "content",
        confidence: 1,
        definition: null,
        conceptId: 604,
        glossaryId: GLOSSARY_ID,
        matchedText: "İÇERİK",
        evidences: [{ channel: "lexical", confidence: 1 }],
      },
    ]);

    const result = await collectTermRecallOp({
      glossaryIds: [GLOSSARY_ID],
      text: "Yeni içerik ekle",
      sourceLanguageId: "tr",
      translationLanguageId: "en",
      channels: ["EXACT"],
    });

    expect(result.outcomes.EXACT.status).toBe("SUCCEEDED");
    expect(getTermRecallCandidates(result)).toEqual([
      expect.objectContaining({ conceptId: 604 }),
    ]);
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
      if (query === mocks.listKeywordTermSuggestions) return [];
      if (query === mocks.listScopedTermRecallDerivationStates) {
        return [
          {
            targetId: "1",
            stateId: 1,
            languageId: fixture.query.sourceLanguageId,
            status: "FRESH",
            demandRevision: 1,
            blocker: null,
            canonicalInputVersion: `sha256:${"c".repeat(64)}`,
            requiredDerivationVersion: `sha256:${"a".repeat(64)}`,
            currentCanonicalInputVersion: `sha256:${"c".repeat(64)}`,
            currentDerivationVersion: `sha256:${"a".repeat(64)}`,
          },
        ];
      }
      return [];
    });

    mocks.semanticSearchTermsOp.mockResolvedValue(termMock?.semantic ?? []);
    mocks.probeGlossaryRecallDependency.mockResolvedValue({
      requiredDerivationVersion: `sha256:${"a".repeat(64)}`,
      tokens: termMock?.languageAnalysisTokens ?? [],
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

    const candidates = getTermRecallCandidates(result);
    const top = candidates[0];
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

    const resultIds = new Set(candidates.map((item) => item.conceptId));
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
