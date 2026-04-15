import { describe, expect, it } from "vitest";

import {
  SuiteConfigSchema,
  ProjectSeedSchema,
  GlossarySeedSchema,
  TermRecallTestSetSchema,
} from "./schemas";

describe("SuiteConfigSchema", () => {
  it("parses a valid suite config", () => {
    const result = SuiteConfigSchema.parse({
      name: "test-suite",
      seed: { project: "seed/project.json" },
      plugins: { loader: "test" },
      scenarios: [
        {
          type: "term-recall",
          "test-set": "test-sets/terms.yaml",
          scorers: ["precision", "recall"],
        },
      ],
    });
    expect(result.name).toBe("test-suite");
    expect(result.plugins.overrides).toEqual([]);
  });

  it("rejects empty scenarios", () => {
    expect(() =>
      SuiteConfigSchema.parse({
        name: "bad",
        seed: { project: "x" },
        plugins: { loader: "test" },
        scenarios: [],
      }),
    ).toThrow();
  });
});

describe("ProjectSeedSchema", () => {
  it("parses valid project seed", () => {
    const result = ProjectSeedSchema.parse({
      name: "Test",
      sourceLanguage: "en",
      translationLanguages: ["zh-Hans"],
    });
    expect(result.name).toBe("Test");
  });
});

describe("GlossarySeedSchema", () => {
  it("parses valid glossary seed", () => {
    const result = GlossarySeedSchema.parse({
      glossary: {
        name: "Test Glossary",
        sourceLanguage: "en",
        translationLanguage: "zh-Hans",
        concepts: [
          {
            ref: "concept:test",
            definition: "A test concept",
            terms: [
              {
                term: "Test",
                termLanguageId: "en",
                translation: "测试",
                translationLanguageId: "zh-Hans",
              },
            ],
          },
        ],
      },
    });
    expect(result.glossary.concepts).toHaveLength(1);
  });
});

describe("TermRecallTestSetSchema", () => {
  it("parses valid test set", () => {
    const result = TermRecallTestSetSchema.parse({
      name: "test-set",
      cases: [
        {
          id: "tc1",
          inputText: "Hello",
          sourceLanguage: "en",
          targetLanguage: "zh-Hans",
          expectedTerms: [
            { conceptRef: "concept:hello", term: "Hello", translation: "你好" },
          ],
        },
      ],
    });
    expect(result.cases).toHaveLength(1);
  });
});
