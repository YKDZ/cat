import {
  executeCommand,
  reconcileRecallDerivationDependency,
} from "@cat/domain";
import {
  PluginManager,
  Tokenizer,
  TokenizerPriority,
  type ParserContext,
} from "@cat/plugin-core";
import {
  computeRecallDerivationVersion,
  LanguageAnalysisVersionSchema,
  ServiceImplementationReferenceSchema,
  serviceImplementationReferenceKey,
} from "@cat/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("@cat/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/domain")>()),
  executeCommand: vi.fn(async () => ({ invalidated: 0, pendingUpdated: 0 })),
}));

import { reconcileMemoryRecallDependency } from "./memory-recall-derivation.ts";

class UnicodeIdTokenizer extends Tokenizer {
  readonly #id: string;

  public constructor(id: string) {
    super();
    this.#id = id;
  }

  public override getId = (): string => this.#id;

  public override getPriority = (): TokenizerPriority =>
    TokenizerPriority.LITERAL;

  public override parse = (_context: ParserContext) => undefined;
}

const snapshot = (serviceId: string, dbId: number) => {
  const reference = ServiceImplementationReferenceSchema.parse({
    pluginId: "unicode-tokenizer",
    serviceId,
    serviceType: "TOKENIZER",
    scopeType: "GLOBAL",
    scopeId: "",
  });
  const service = new UnicodeIdTokenizer(serviceId);
  return {
    reference,
    registeredService: {
      pluginId: "unicode-tokenizer",
      type: "TOKENIZER" as const,
      id: serviceId,
      dbId,
      service,
    },
    package: { name: "unicode-tokenizer", version: "1.0.0" },
    configuration: {
      semanticConfig: {},
      configurationDigest: `sha256:${"c".repeat(64)}`,
      appliedVersion: null,
      schemaVersion: null,
      schemaDigest: null,
    },
    activationGeneration: 1,
  };
};

describe("Memory recall tokenizer pipeline ordering", () => {
  it("uses code-unit ordering for Unicode service IDs and a stable version", async () => {
    const languageAnalysisVersion = LanguageAnalysisVersionSchema.parse(
      `sha256:${"a".repeat(64)}`,
    );
    const unicodeFirst = snapshot("ä", 1);
    const asciiFirst = snapshot("z", 2);
    const manager = {
      captureServiceRuntimeSnapshots: vi
        .fn()
        .mockResolvedValue([unicodeFirst, asciiFirst]),
    } as unknown as PluginManager;

    const expected = await computeRecallDerivationVersion({
      contract: "cat.memory-recall-derivation/v1",
      languageAnalysisVersion,
      tokenizerPipeline: [asciiFirst, unicodeFirst].map((entry) => ({
        reference: entry.reference,
        packageName: entry.package.name,
        packageVersion: entry.package.version,
        priority: entry.registeredService.service.getPriority(),
        tieBreak: serviceImplementationReferenceKey(entry.reference),
        semanticConfig: entry.configuration.semanticConfig,
        configurationDigest: entry.configuration.configurationDigest,
      })),
      normalization: {
        caseFolding: "Intl.toLocaleLowerCase",
        lemmaJoin: "cat.language-analysis-normalization/v1",
      },
      rules: {
        keywordTokens: "content-token-lemma/v1",
        maxWindowSize: 6,
        templateOrientation: "query-side/v1",
        stopWords: "language-analysis-isStop",
      },
    });
    const first = await reconcileMemoryRecallDependency({
      db: {} as never,
      pluginManager: manager,
      languageId: "en",
      languageAnalysisVersion,
    });
    manager.captureServiceRuntimeSnapshots = vi
      .fn()
      .mockResolvedValue([asciiFirst, unicodeFirst]);
    const reordered = await reconcileMemoryRecallDependency({
      db: {} as never,
      pluginManager: manager,
      languageId: "en",
      languageAnalysisVersion,
    });

    expect(first.requiredDerivationVersion).toBe(expected);
    expect(reordered.requiredDerivationVersion).toBe(expected);
    expect(executeCommand).toHaveBeenCalledWith(
      expect.anything(),
      reconcileRecallDerivationDependency,
      expect.objectContaining({ requiredDerivationVersion: expected }),
    );
  });
});
