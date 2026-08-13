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
  selectFirstServiceImplementation: vi.fn(),
  reconcileGlossaryRecallDependency: vi.fn(),
  getRequiredLanguageAnalysisSnapshot: vi.fn(),
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

vi.mock("@cat/server-shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/server-shared")>(
      "@cat/server-shared",
    );
  return {
    ...actual,
    selectFirstServiceImplementation: mocks.selectFirstServiceImplementation,
  };
});

vi.mock("./glossary-recall-derivation.ts", () => ({
  reconcileGlossaryRecallDependency: mocks.reconcileGlossaryRecallDependency,
}));

vi.mock("./language-analysis-requirement.ts", async () => {
  const actual = await vi.importActual<
    typeof import("./language-analysis-requirement.ts")
  >("./language-analysis-requirement.ts");
  return {
    ...actual,
    getRequiredLanguageAnalysisSnapshot:
      mocks.getRequiredLanguageAnalysisSnapshot,
  };
});

import {
  collectTermRecallOp,
  getTermRecallCandidates,
} from "./collect-term-recall.ts";
import { TermRecallInputSchema } from "./term-recall.ts";
import { RecallFixtureSchema } from "./testing/recall-fixture-schema.ts";

const FIXTURE_DIR = fileURLToPath(
  new URL("./__fixtures__/recall", import.meta.url),
);
const GLOSSARY_ID = "11111111-1111-4111-8111-111111111111";
const ANALYSIS_VERSION = `sha256:${"a".repeat(64)}`;

const token = (text: string, start: number, end: number) => ({
  text: text.slice(start, end),
  lemma: text.slice(start, end).toLocaleLowerCase("en"),
  pos: "NOUN",
  start,
  end,
  isStop: false,
  isPunct: false,
});

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
    "sourceLanguageAnalysisTokens",
    "sourceLanguageAnalysisVersion",
    "unexpectedProof",
  ])("rejects public caller-supplied field %s", (field) => {
    expect(() =>
      TermRecallInputSchema.parse({
        glossaryIds: [GLOSSARY_ID],
        text: "Allay Spawn Egg",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        [field]: [],
      }),
    ).toThrow("Unrecognized key");
  });

  it.each([
    ["sourceLanguageId", "not a language"],
    ["translationLanguageId", "x-private"],
  ])("rejects non-normalized public %s", (field, languageId) => {
    expect(() =>
      TermRecallInputSchema.parse({
        glossaryIds: [GLOSSARY_ID],
        text: "Allay Spawn Egg",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        [field]: languageId,
      }),
    ).toThrow();
  });

  it("normalizes public language IDs", () => {
    expect(
      TermRecallInputSchema.parse({
        glossaryIds: [GLOSSARY_ID],
        text: "Allay Spawn Egg",
        sourceLanguageId: "en-us",
        translationLanguageId: "zh-hans",
      }),
    ).toMatchObject({
      sourceLanguageId: "en-US",
      translationLanguageId: "zh-Hans",
    });
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
      const tokens =
        text === "use the allay spawn egg now"
          ? [
              token(text, 0, 3),
              token(text, 4, 7),
              token(text, 8, 13),
              token(text, 14, 19),
              token(text, 20, 23),
              token(text, 24, 27),
            ]
          : [token(text, 0, 5), token(text, 6, 11)];
      mocks.getRequiredLanguageAnalysisSnapshot.mockResolvedValue({
        languageAnalysisVersion: ANALYSIS_VERSION,
        tokens,
      });
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
      expect(mocks.getRequiredLanguageAnalysisSnapshot).toHaveBeenCalledOnce();
    },
  );

  it("does not treat a short term inside a longer word as Exact", async () => {
    const text = "concatenate the files";
    mocks.getRequiredLanguageAnalysisSnapshot.mockResolvedValue({
      languageAnalysisVersion: ANALYSIS_VERSION,
      tokens: [token(text, 0, 11), token(text, 12, 15), token(text, 16, 21)],
    });
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
      text,
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      channels: ["EXACT"],
    });

    expect(result.outcomes.EXACT).toEqual({ status: "EMPTY" });
    expect(getTermRecallCandidates(result)).toEqual([]);
  });

  it("finds an Exact term occurrence in a language without spaces", async () => {
    const text = "请清理内存缓存";
    mocks.getRequiredLanguageAnalysisSnapshot.mockResolvedValue({
      languageAnalysisVersion: ANALYSIS_VERSION,
      tokens: text.split("").map((_, index) => token(text, index, index + 1)),
    });
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
      text,
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
    const text = "Yeni içerik ekle";
    mocks.getRequiredLanguageAnalysisSnapshot.mockResolvedValue({
      languageAnalysisVersion: ANALYSIS_VERSION,
      tokens: [token(text, 0, 4), token(text, 5, 11), token(text, 12, 16)],
    });
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
      text,
      sourceLanguageId: "tr",
      translationLanguageId: "en",
      channels: ["EXACT"],
    });

    expect(result.outcomes.EXACT.status).toBe("SUCCEEDED");
    expect(getTermRecallCandidates(result)).toEqual([
      expect.objectContaining({ conceptId: 604 }),
    ]);
  });

  it("uses UTF-16 token boundaries after an astral prefix and punctuation", async () => {
    const text = "😀 cat, dog";
    mocks.getRequiredLanguageAnalysisSnapshot.mockResolvedValue({
      languageAnalysisVersion: ANALYSIS_VERSION,
      tokens: [
        token(text, 0, 2),
        token(text, 3, 6),
        token(text, 6, 7),
        token(text, 8, 11),
      ],
    });
    mocks.executeQuery.mockResolvedValue([
      {
        term: "cat",
        translation: "猫",
        confidence: 1,
        definition: null,
        conceptId: 606,
        glossaryId: GLOSSARY_ID,
        matchedText: "cat",
        evidences: [{ channel: "lexical", confidence: 1 }],
      },
    ]);

    const result = await collectTermRecallOp({
      glossaryIds: [GLOSSARY_ID],
      text,
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      channels: ["EXACT"],
    });

    expect(result.outcomes.EXACT).toMatchObject({ status: "SUCCEEDED" });
  });

  it("does not reconcile derivations for Exact-only recall", async () => {
    const text = "exact term";
    mocks.getRequiredLanguageAnalysisSnapshot.mockResolvedValue({
      languageAnalysisVersion: ANALYSIS_VERSION,
      tokens: [token(text, 0, 5), token(text, 6, 10)],
    });
    mocks.reconcileGlossaryRecallDependency.mockRejectedValue(
      new Error("tokenizer unavailable"),
    );
    mocks.executeQuery.mockResolvedValue([
      {
        term: "exact term",
        translation: "精确术语",
        confidence: 1,
        definition: null,
        conceptId: 607,
        glossaryId: GLOSSARY_ID,
        matchedText: "exact term",
        evidences: [{ channel: "lexical", confidence: 1 }],
      },
    ]);

    const result = await collectTermRecallOp({
      glossaryIds: [GLOSSARY_ID],
      text,
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      channels: ["EXACT"],
    });

    expect(result.outcomes.EXACT).toMatchObject({ status: "SUCCEEDED" });
    expect(mocks.reconcileGlossaryRecallDependency).not.toHaveBeenCalled();
  });

  it("keeps Exact successful when derived-channel reconciliation is blocked", async () => {
    const text = "exact term";
    mocks.getRequiredLanguageAnalysisSnapshot.mockResolvedValue({
      languageAnalysisVersion: ANALYSIS_VERSION,
      tokens: [token(text, 0, 5), token(text, 6, 10)],
    });
    mocks.reconcileGlossaryRecallDependency.mockRejectedValue(
      new Error("tokenizer unavailable"),
    );
    mocks.executeQuery.mockResolvedValue([
      {
        term: "exact term",
        translation: "精确术语",
        confidence: 1,
        definition: null,
        conceptId: 608,
        glossaryId: GLOSSARY_ID,
        matchedText: "exact term",
        evidences: [{ channel: "lexical", confidence: 1 }],
      },
    ]);

    const result = await collectTermRecallOp({
      glossaryIds: [GLOSSARY_ID],
      text,
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      channels: ["EXACT", "KEYWORD", "VARIANT"],
    });

    expect(result.outcomes.EXACT).toMatchObject({ status: "SUCCEEDED" });
    expect(result.outcomes.KEYWORD).toMatchObject({ status: "BLOCKED" });
    expect(result.outcomes.VARIANT).toMatchObject({ status: "BLOCKED" });
  });

  it("blocks only analysis-dependent term channels when analysis fails", async () => {
    const semanticCandidate = {
      term: "memory",
      translation: "记忆",
      confidence: 0.9,
      definition: null,
      conceptId: 606,
      glossaryId: GLOSSARY_ID,
      matchedText: "memory",
      evidences: [{ channel: "semantic" as const, confidence: 0.9 }],
    };
    mocks.executeQuery.mockResolvedValue([
      {
        term: "memory",
        translation: "记忆",
        confidence: 0.9,
        definition: null,
        conceptId: 605,
        glossaryId: GLOSSARY_ID,
        matchedText: "memory",
        evidences: [{ channel: "lexical", confidence: 0.9 }],
      },
    ]);
    mocks.getRequiredLanguageAnalysisSnapshot.mockRejectedValue(
      new Error("analyzer unavailable"),
    );
    mocks.selectFirstServiceImplementation.mockImplementation(
      (_pluginManager, serviceType) =>
        serviceType === "TEXT_VECTORIZER"
          ? { reference: { serviceId: "vectorizer" }, service: {} }
          : serviceType === "VECTOR_STORAGE"
            ? { reference: { serviceId: "vector-storage" }, service: {} }
            : undefined,
    );
    mocks.semanticSearchTermsOp.mockResolvedValue([semanticCandidate]);

    const result = await collectTermRecallOp({
      glossaryIds: [GLOSSARY_ID],
      text: "memory",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      channels: ["EXACT", "FUZZY", "SEMANTIC"],
    });

    expect(result.outcomes.EXACT).toMatchObject({ status: "BLOCKED" });
    expect(result.outcomes.FUZZY).toMatchObject({
      status: "SUCCEEDED",
      candidates: [expect.objectContaining({ conceptId: 605 })],
    });
    expect(result.outcomes.SEMANTIC).toMatchObject({
      status: "SUCCEEDED",
      candidates: [expect.objectContaining({ conceptId: 606 })],
    });
  });

  it("does not request Language Analysis for Fuzzy-only term recall", async () => {
    mocks.getRequiredLanguageAnalysisSnapshot.mockRejectedValue(
      new Error("analyzer must not run"),
    );
    mocks.executeQuery.mockResolvedValue([
      {
        term: "memory",
        translation: "记忆",
        confidence: 0.9,
        definition: null,
        conceptId: 607,
        glossaryId: GLOSSARY_ID,
        matchedText: "memory",
        evidences: [{ channel: "lexical", confidence: 0.9 }],
      },
    ]);

    await expect(
      collectTermRecallOp({
        glossaryIds: [GLOSSARY_ID],
        text: "memory",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        channels: ["FUZZY"],
      }),
    ).resolves.toMatchObject({
      outcomes: { FUZZY: { status: "SUCCEEDED" } },
    });
    expect(mocks.getRequiredLanguageAnalysisSnapshot).not.toHaveBeenCalled();
  });

  it("does not request Language Analysis for Semantic-only term recall", async () => {
    mocks.getRequiredLanguageAnalysisSnapshot.mockRejectedValue(
      new Error("analyzer must not run"),
    );
    mocks.selectFirstServiceImplementation.mockImplementation(
      (_pluginManager, serviceType) =>
        serviceType === "TEXT_VECTORIZER"
          ? { reference: { serviceId: "vectorizer" }, service: {} }
          : serviceType === "VECTOR_STORAGE"
            ? { reference: { serviceId: "vector-storage" }, service: {} }
            : undefined,
    );
    mocks.semanticSearchTermsOp.mockResolvedValue([
      {
        term: "semantic memory",
        translation: "语义记忆",
        confidence: 0.9,
        definition: null,
        conceptId: 608,
        glossaryId: GLOSSARY_ID,
        matchedText: "semantic memory",
        evidences: [{ channel: "semantic", confidence: 0.9 }],
      },
    ]);

    await expect(
      collectTermRecallOp({
        glossaryIds: [GLOSSARY_ID],
        text: "semantic memory",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        channels: ["SEMANTIC"],
      }),
    ).resolves.toMatchObject({
      outcomes: { SEMANTIC: { status: "SUCCEEDED" } },
    });
    expect(mocks.getRequiredLanguageAnalysisSnapshot).not.toHaveBeenCalled();
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
    mocks.getRequiredLanguageAnalysisSnapshot.mockResolvedValue({
      languageAnalysisVersion: `sha256:${"a".repeat(64)}`,
      tokens: termMock?.languageAnalysisTokens ?? [],
    });
    mocks.reconcileGlossaryRecallDependency.mockResolvedValue({
      requiredDerivationVersion: `sha256:${"a".repeat(64)}`,
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
