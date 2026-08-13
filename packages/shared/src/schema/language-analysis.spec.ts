import { describe, expect, test } from "vitest";

import {
  computeLanguageAnalysisVersion,
  type LanguageAnalysisAttestation,
  LanguageAnalysisAttestationSchema,
  LanguageAnalyzerConfigurationAssessmentSchema,
  LanguageAnalysisVersionSchema,
  NormalizedLanguageIdSchema,
  normalizeLanguageId,
  validateLanguageAnalysisBatchResult,
  validateLanguageAnalysisResult,
} from "./language-analysis.ts";
import { ServiceImplementationReferenceSchema } from "./service-implementation-reference.ts";

const attestation = LanguageAnalysisAttestationSchema.parse({
  contract: "cat.language-analysis/v1" as const,
  languageId: "en-US",
  implementation: {
    reference: {
      pluginId: "spacy-language-analyzer",
      serviceId: "spacy-language-analyzer",
      serviceType: "LANGUAGE_ANALYZER",
      scopeType: "GLOBAL",
      scopeId: "",
    },
    packageName: "@cat-plugin/spacy-language-analyzer",
    packageVersion: "0.1.0",
  },
  generation: {
    id: `sha256:${"b".repeat(64)}`,
    planDigest: "c".repeat(64),
    schemaVersion: "1",
    provisionerVersion: "1",
    serverProtocolVersion: "1",
    sitePackagesDigest: "d".repeat(64),
    pythonAbi: "cpython-312",
    pythonImplementation: "cpython",
    pythonVersion: "3.12.11",
    platform: "linux-x86_64",
    spacyVersion: "3.8.7",
  },
  semanticConfig: {
    exclude: ["ner", "parser"],
    sentenceBoundary: "sentencizer",
  },
  engine: { name: "spaCy", version: "3.8.0" },
  pipeline: { id: "sentencizer", version: "1" },
  model: { id: "en_core_web_sm", version: "3.8.0" },
  assets: [
    {
      id: "en_core_web_sm-3.8.0-py3-none-any.whl",
      version: "3.8.0",
      sha256: "a".repeat(64),
    },
  ],
});

describe("LanguageAnalyzerConfigurationAssessmentSchema", () => {
  test("canonicalizes a non-empty unique VALID language declaration", () => {
    expect(
      LanguageAnalyzerConfigurationAssessmentSchema.parse({
        status: "VALID",
        supportedLanguages: ["en-us", "zh-hant-tw"],
        semanticConfiguration: { mode: "accurate" },
      }),
    ).toEqual({
      status: "VALID",
      supportedLanguages: ["en-US", "zh-Hant-TW"],
      semanticConfiguration: { mode: "accurate" },
    });
  });

  test.each([
    { supportedLanguages: [], semanticConfiguration: {} },
    { supportedLanguages: ["en-US", "en-us"], semanticConfiguration: {} },
    {
      supportedLanguages: ["en-US"],
      semanticConfiguration: { invalid: undefined },
    },
  ])("rejects malformed VALID declarations", (value) => {
    expect(() =>
      LanguageAnalyzerConfigurationAssessmentSchema.parse({
        status: "VALID",
        ...value,
      }),
    ).toThrow();
  });

  test("rejects undeclared fields in either branch", () => {
    expect(() =>
      LanguageAnalyzerConfigurationAssessmentSchema.parse({
        status: "INVALID",
        reason: "INVALID_CONFIGURATION",
        detail: "not part of the contract",
      }),
    ).toThrow();
  });
});

describe("Language Analysis contract", () => {
  test("normalizes valid BCP 47 IDs and rejects whitespace or malformed IDs", () => {
    expect(NormalizedLanguageIdSchema.parse("en-us")).toBe("en-US");
    expect(NormalizedLanguageIdSchema.parse("iw")).toBe("he");
    expect(() => NormalizedLanguageIdSchema.parse(" en-US ")).toThrow();
    expect(() => NormalizedLanguageIdSchema.parse("x-private")).toThrow();
    expect(() => NormalizedLanguageIdSchema.parse("i-klingon")).toThrow();
    expect(() => NormalizedLanguageIdSchema.parse("not a language")).toThrow();
  });

  test("derives deterministic versions from every semantic attestation input", async () => {
    const first = await computeLanguageAnalysisVersion(attestation);
    const reordered = await computeLanguageAnalysisVersion({
      ...attestation,
      semanticConfig: {
        sentenceBoundary: "sentencizer",
        exclude: ["ner", "parser"],
      },
    });
    expect(reordered).toBe(first);
    const changedAttestations: LanguageAnalysisAttestation[] = [
      { ...attestation, languageId: normalizeLanguageId("en-GB") },
      {
        ...attestation,
        implementation: {
          ...attestation.implementation,
          reference: {
            ...ServiceImplementationReferenceSchema.parse({
              ...attestation.implementation.reference,
              scopeType: "PROJECT",
              scopeId: "11111111-1111-4111-8111-111111111111",
            }),
          },
        },
      },
      {
        ...attestation,
        implementation: {
          ...attestation.implementation,
          packageName: "@example/other-analyzer",
        },
      },
      {
        ...attestation,
        implementation: {
          ...attestation.implementation,
          packageVersion: "0.1.1",
        },
      },
      { ...attestation, semanticConfig: { changed: true } },
      {
        ...attestation,
        generation: {
          ...attestation.generation,
          id: `sha256:${"d".repeat(64)}`,
        },
      },
      { ...attestation, engine: { ...attestation.engine, version: "3.8.1" } },
      { ...attestation, pipeline: { ...attestation.pipeline, version: "2" } },
      { ...attestation, model: { ...attestation.model, version: "3.8.1" } },
      {
        ...attestation,
        assets: attestation.assets.map((asset, index) =>
          index === 0 ? { ...asset, sha256: "b".repeat(64) } : asset,
        ),
      },
      {
        ...attestation,
        assets: attestation.assets.map((asset, index) =>
          index === 0 ? { ...asset, id: "other-asset" } : asset,
        ),
      },
      {
        ...attestation,
        assets: attestation.assets.map((asset, index) =>
          index === 0 ? { ...asset, version: "2" } : asset,
        ),
      },
    ];
    for (const changed of changedAttestations) {
      await expect(computeLanguageAnalysisVersion(changed)).resolves.not.toBe(
        first,
      );
    }
    expect(LanguageAnalysisVersionSchema.parse(first)).toBe(first);
    expect(() => LanguageAnalysisVersionSchema.parse("sha256:ABC")).toThrow();
    expect(
      LanguageAnalysisAttestationSchema.safeParse({
        ...attestation,
        contract: "cat.language-analysis/v2",
      }).success,
    ).toBe(false);
    expect(
      LanguageAnalysisAttestationSchema.safeParse({
        ...attestation,
        implementation: {
          ...attestation.implementation,
          reference: {
            ...attestation.implementation.reference,
            serviceType: "TOKENIZER",
          },
        },
      }).success,
    ).toBe(false);
  });

  test("treats asset array order as semantic while canonicalizing object keys", async () => {
    const withTwoAssets = LanguageAnalysisAttestationSchema.parse({
      ...attestation,
      assets: [
        ...attestation.assets,
        { id: "second", version: "1", sha256: "b".repeat(64) },
      ],
    });
    await expect(
      computeLanguageAnalysisVersion({
        ...withTwoAssets,
        assets: [...withTwoAssets.assets].reverse(),
      }),
    ).resolves.not.toBe(await computeLanguageAnalysisVersion(withTwoAssets));
  });

  test("rejects missing attestation and language mismatches", () => {
    expect(() =>
      validateLanguageAnalysisResult(
        { sentences: [], tokens: [] },
        normalizeLanguageId("en-US"),
        { text: "", implementation: attestation.implementation },
      ),
    ).toThrow();
    expect(() =>
      validateLanguageAnalysisResult(
        {
          sentences: [],
          tokens: [],
          attestation: { ...attestation, languageId: "zh-Hans" },
        },
        normalizeLanguageId("en-US"),
        { text: "", implementation: attestation.implementation },
      ),
    ).toThrow("does not match");
  });

  test("requires exact implementation identity and UTF-16-consistent ranges", () => {
    const text = "A😀 word";
    const result = {
      sentences: [
        {
          text,
          start: 0,
          end: text.length,
          tokens: [
            {
              text: "word",
              lemma: "word",
              pos: "NOUN",
              start: 4,
              end: 8,
              isStop: false,
              isPunct: false,
            },
          ],
        },
      ],
      tokens: [
        {
          text: "word",
          lemma: "word",
          pos: "NOUN",
          start: 4,
          end: 8,
          isStop: false,
          isPunct: false,
        },
      ],
      attestation,
    };

    expect(() =>
      validateLanguageAnalysisResult(result, normalizeLanguageId("en-US"), {
        text,
        implementation: attestation.implementation,
      }),
    ).not.toThrow();
    expect(() =>
      validateLanguageAnalysisResult(result, normalizeLanguageId("en-US"), {
        text,
        implementation: {
          ...attestation.implementation,
          reference: {
            ...ServiceImplementationReferenceSchema.parse({
              ...attestation.implementation.reference,
              serviceId: "different-service",
            }),
          },
        },
      }),
    ).toThrow("implementation does not match");
    expect(() =>
      validateLanguageAnalysisResult(
        {
          ...result,
          tokens: [{ ...result.tokens[0], start: 3, end: 7 }],
        },
        normalizeLanguageId("en-US"),
        { text, implementation: attestation.implementation },
      ),
    ).toThrow("range");
  });

  test("rejects empty, overlapping, unordered, and inconsistent token ranges", () => {
    const text = "one two";
    const token = {
      text: "one",
      lemma: "one",
      pos: "NOUN",
      start: 0,
      end: 3,
      isStop: false,
      isPunct: false,
    };
    const valid = {
      sentences: [{ text, start: 0, end: text.length, tokens: [token] }],
      tokens: [token],
      attestation,
    };
    const options = { text, implementation: attestation.implementation };
    expect(() =>
      validateLanguageAnalysisResult(
        {
          ...valid,
          sentences: [
            {
              ...valid.sentences[0],
              tokens: [{ ...token, text: "", start: 0, end: 0 }],
            },
          ],
          tokens: [{ ...token, text: "", start: 0, end: 0 }],
        },
        normalizeLanguageId("en-US"),
        options,
      ),
    ).toThrow("contract");
    const second = { ...token, text: "two", lemma: "two", start: 4, end: 7 };
    expect(() =>
      validateLanguageAnalysisResult(
        {
          ...valid,
          sentences: [
            {
              ...valid.sentences[0],
              tokens: [second, token],
            },
          ],
          tokens: [second, token],
        },
        normalizeLanguageId("en-US"),
        options,
      ),
    ).toThrow("source-ordered");
    const overlapping = { ...second, start: 2 };
    expect(() =>
      validateLanguageAnalysisResult(
        {
          ...valid,
          sentences: [
            {
              ...valid.sentences[0],
              tokens: [token, overlapping],
            },
          ],
          tokens: [token, overlapping],
        },
        normalizeLanguageId("en-US"),
        options,
      ),
    ).toThrow("non-overlapping");
  });

  test("requires a non-empty batch response in the request order with exactly one result per ID", () => {
    const item = { id: "first", text: "Hello" };
    const result = {
      sentences: [
        { text: item.text, start: 0, end: item.text.length, tokens: [] },
      ],
      tokens: [],
      attestation,
    };
    const batch = { attestation, results: [{ id: item.id, result }] };
    expect(() =>
      validateLanguageAnalysisBatchResult(batch, normalizeLanguageId("en-US"), {
        items: [item],
        implementation: attestation.implementation,
      }),
    ).not.toThrow();
    expect(() =>
      validateLanguageAnalysisBatchResult(batch, normalizeLanguageId("en-US"), {
        items: [],
        implementation: attestation.implementation,
      }),
    ).toThrow("non-empty");
    expect(() =>
      validateLanguageAnalysisBatchResult(
        { ...batch, results: [{ ...batch.results[0], id: "other" }] },
        normalizeLanguageId("en-US"),
        { items: [item], implementation: attestation.implementation },
      ),
    ).toThrow("order");
    expect(() =>
      validateLanguageAnalysisBatchResult(
        {
          attestation,
          results: [
            { id: "first", result },
            { id: "first", result },
          ],
        },
        normalizeLanguageId("en-US"),
        {
          items: [item, item],
          implementation: attestation.implementation,
        },
      ),
    ).toThrow("must be unique");
  });
});
