import { describe, expect, it } from "vitest";

import {
  computeRecallDerivationVersion,
  RecallDerivationReferenceSchema,
} from "./recall-derivation.ts";

describe("Recall Derivation contract", () => {
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
});
