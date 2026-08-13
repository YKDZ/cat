import { describe, expect, it } from "vitest";

import { compareCodeUnitStrings } from "../utils/string.ts";
import {
  computeTermConceptCanonicalInputVersion,
  TermConceptCanonicalSnapshotSchema,
} from "./glossary-recall-derivation.ts";
import { NormalizedLanguageIdSchema } from "./language-analysis.ts";
import {
  classifyRecallDerivationBlocker,
  compareRecallDerivationTokenizerPipelineEntries,
  computeRecallDerivationVersion,
  RecallDerivationReferenceSchema,
} from "./recall-derivation.ts";

describe("Recall Derivation contract", () => {
  it("classifies dependency blockers as explicitly recoverable lifecycle blocks", () => {
    expect(
      classifyRecallDerivationBlocker({
        reason: "LANGUAGE_ANALYSIS",
        retryable: false,
        message: "Analyzer configuration is invalid.",
      }),
    ).toBe("BLOCKED");
    expect(
      classifyRecallDerivationBlocker({
        reason: "TOKENIZER",
        retryable: false,
        message: "Tokenizer package is unavailable.",
      }),
    ).toBe("BLOCKED");
  });

  it.each([
    { retryable: true, lifecycle: "PENDING" },
    { retryable: false, lifecycle: "FAILED" },
  ] as const)(
    "classifies retryable=$retryable execution failures as $lifecycle",
    ({ retryable, lifecycle }) => {
      expect(
        classifyRecallDerivationBlocker({
          reason: "DERIVATION_EXECUTION",
          retryable,
          message: "Derivation execution failed.",
        }),
      ).toBe(lifecycle);
    },
  );

  it.each(["LANGUAGE_ANALYSIS", "TOKENIZER"] as const)(
    "classifies a retryable %s blocker as pending",
    (reason) => {
      expect(
        classifyRecallDerivationBlocker({
          reason,
          retryable: true,
          message: "Dependency is temporarily unavailable.",
        }),
      ).toBe("PENDING");
    },
  );

  it("computes a stable content-addressed version", async () => {
    const first = await computeRecallDerivationVersion({
      contract: "cat.recall-derivation/memory/v1",
      languageAnalysisVersion:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      normalization: { caseFold: "unicode-lowercase/v1" },
      rules: { maxWindowSize: 6, variantTypes: ["SURFACE", "LEMMA"] },
      tokenizerPipeline: [
        {
          reference: {
            pluginId: "literal-tokenizer",
            serviceId: "literal",
            serviceType: "TOKENIZER",
            scopeType: "GLOBAL",
            scopeId: "",
          },
          packageName: "@cat-plugin/literal-tokenizer",
          packageVersion: "1.0.0",
          priority: 10,
          tieBreak: "GLOBAL::literal-tokenizer::literal",
          semanticConfig: { mode: "literal" },
          configurationDigest:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    });
    const reordered = await computeRecallDerivationVersion({
      tokenizerPipeline: [
        {
          tieBreak: "GLOBAL::literal-tokenizer::literal",
          priority: 10,
          packageVersion: "1.0.0",
          packageName: "@cat-plugin/literal-tokenizer",
          semanticConfig: { mode: "literal" },
          configurationDigest:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          reference: {
            scopeId: "",
            scopeType: "GLOBAL",
            serviceType: "TOKENIZER",
            serviceId: "literal",
            pluginId: "literal-tokenizer",
          },
        },
      ],
      rules: { variantTypes: ["SURFACE", "LEMMA"], maxWindowSize: 6 },
      normalization: { caseFold: "unicode-lowercase/v1" },
      languageAnalysisVersion:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contract: "cat.recall-derivation/memory/v1",
    });

    expect(first).toBe(reordered);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("normalizes languages in typed derivation references", () => {
    expect(
      RecallDerivationReferenceSchema.parse({
        targetKind: "MEMORY_ITEM",
        targetId: "42",
        languageId: "zh-hans",
        demandRevision: 3,
      }),
    ).toEqual({
      targetKind: "MEMORY_ITEM",
      targetId: "42",
      languageId: "zh-Hans",
      demandRevision: 3,
    });
  });

  it("orders Unicode by code unit and hashes reordered Glossary input identically", async () => {
    expect(["ä-tokenizer", "z-tokenizer"].sort(compareCodeUnitStrings)).toEqual(
      ["z-tokenizer", "ä-tokenizer"],
    );

    const snapshot = TermConceptCanonicalSnapshotSchema.parse({
      id: 7,
      glossaryId: "16c4a6c9-78b1-4f29-926c-79a603225821",
      creatorId: null,
      definition: "Unicode canonical input",
      terms: [
        {
          id: 12,
          creatorId: null,
          text: "äther",
          languageId: "en",
          type: "FULL_FORM",
          status: "PREFERRED",
        },
        {
          id: 2,
          creatorId: null,
          text: "zebra",
          languageId: "en",
          type: "FULL_FORM",
          status: "PREFERRED",
        },
      ],
      subjects: [
        {
          id: 5,
          creatorId: null,
          subject: "ä-subject",
          defaultDefinition: null,
          isPrimary: false,
        },
        {
          id: 3,
          creatorId: null,
          subject: "z-subject",
          defaultDefinition: null,
          isPrimary: true,
        },
      ],
    });

    const languageId = NormalizedLanguageIdSchema.parse("en");
    await expect(
      computeTermConceptCanonicalInputVersion(snapshot, languageId),
    ).resolves.toBe(
      await computeTermConceptCanonicalInputVersion(
        {
          ...snapshot,
          terms: [...snapshot.terms].reverse(),
          subjects: [...snapshot.subjects].reverse(),
        },
        languageId,
      ),
    );
  });

  it("keeps the Glossary tokenizer pipeline order and version stable for z and ä", async () => {
    const tokenizerEntry = (tieBreak: string) => ({
      reference: {
        pluginId:
          tieBreak === "z-tokenizer" ? "tokenizer-z" : "tokenizer-umlaut",
        serviceId: "tokenizer",
        serviceType: "TOKENIZER" as const,
        scopeType: "GLOBAL" as const,
        scopeId: "" as const,
      },
      packageName: `@cat-plugin/${tieBreak}`,
      packageVersion: "1.0.0",
      priority: 10,
      tieBreak,
      semanticConfig: null,
      configurationDigest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    const pipeline = [
      tokenizerEntry("ä-tokenizer"),
      tokenizerEntry("z-tokenizer"),
    ];
    const ordered = [...pipeline].sort(
      compareRecallDerivationTokenizerPipelineEntries,
    );
    const reordered = [...pipeline]
      .reverse()
      .sort(compareRecallDerivationTokenizerPipelineEntries);
    expect(ordered.map((entry) => entry.tieBreak)).toEqual([
      "z-tokenizer",
      "ä-tokenizer",
    ]);

    const versionInput = {
      contract: "cat.glossary-recall-derivation/v1",
      languageAnalysisVersion:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      normalization: { caseFolding: "Intl.toLocaleLowerCase" },
      rules: { maxWindowSize: 6 },
    };
    const orderedVersion = await computeRecallDerivationVersion({
      ...versionInput,
      tokenizerPipeline: ordered,
    });
    const reorderedVersion = await computeRecallDerivationVersion({
      ...versionInput,
      tokenizerPipeline: reordered,
    });
    expect(orderedVersion).toBe(reorderedVersion);
  });
});
