import {
  LanguageAnalysisAttestationSchema,
  normalizeLanguageId,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { beforeEach, describe, expect, test, vi } from "vitest";

const reference = ServiceImplementationReferenceSchema.parse({
  pluginId: "analyzer-plugin",
  serviceId: "analyzer",
  serviceType: "LANGUAGE_ANALYZER",
  scopeType: "GLOBAL",
  scopeId: "",
});

const mocks = vi.hoisted(() => ({
  analyzer: { analyze: vi.fn(), batchAnalyze: vi.fn() },
  manager: {
    getLoader: () => ({
      getData: async () => ({ name: "@example/analyzer", version: "1.0.0" }),
    }),
  },
}));

vi.mock("@cat/server-shared", () => ({
  resolvePluginManager: () => mocks.manager,
  resolveServiceImplementation: () => mocks.analyzer,
  selectFirstServiceImplementation: () => undefined,
}));

import {
  executeLanguageAnalysis,
  executeLanguageAnalysisBatch,
} from "./language-analysis-execution.ts";

const attestation = LanguageAnalysisAttestationSchema.parse({
  contract: "cat.language-analysis/v1",
  languageId: "en",
  implementation: {
    reference,
    packageName: "@example/analyzer",
    packageVersion: "1.0.0",
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
  semanticConfig: { tokenizer: "example" },
  engine: { name: "example", version: "1" },
  pipeline: { id: "example", version: "1" },
  model: { id: "example", version: "1" },
  assets: [{ id: "example", version: "1", sha256: "a".repeat(64) }],
});

const analysis = (text: string, override: object = {}) => ({
  sentences: [{ text, start: 0, end: text.length, tokens: [] }],
  tokens: [],
  attestation: { ...attestation, ...override },
});

describe("Language Analysis execution", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns a host-computed version only after exact implementation validation", async () => {
    mocks.analyzer.analyze.mockResolvedValue(analysis("Hello"));

    const result = await executeLanguageAnalysis({
      languageAnalyzer: reference,
      text: "Hello",
      languageId: normalizeLanguageId("en"),
    });

    expect(result.languageAnalysisVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(mocks.analyzer.analyze).toHaveBeenCalledWith({
      text: "Hello",
      languageId: normalizeLanguageId("en"),
    });
  });

  test("rejects a response that claims another exact implementation or package", async () => {
    mocks.analyzer.analyze.mockResolvedValue(
      analysis("Hello", {
        implementation: {
          ...attestation.implementation,
          reference: ServiceImplementationReferenceSchema.parse({
            ...reference,
            serviceId: "other",
          }),
        },
      }),
    );
    await expect(
      executeLanguageAnalysis({
        languageAnalyzer: reference,
        text: "Hello",
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toThrow("implementation does not match");

    mocks.analyzer.analyze.mockResolvedValue(
      analysis("Hello", {
        implementation: {
          ...attestation.implementation,
          packageVersion: "2.0.0",
        },
      }),
    );
    await expect(
      executeLanguageAnalysis({
        languageAnalyzer: reference,
        text: "Hello",
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toThrow("package identity");
  });

  test("rejects a batch response that is not an input-order bijection", async () => {
    mocks.analyzer.batchAnalyze.mockResolvedValue({
      attestation,
      results: [{ id: "other", result: analysis("Hello") }],
    });
    await expect(
      executeLanguageAnalysisBatch({
        languageAnalyzer: reference,
        items: [{ id: "first", text: "Hello" }],
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toThrow("IDs must match request IDs in order");
  });
});
