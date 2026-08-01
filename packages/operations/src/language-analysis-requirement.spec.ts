import {
  LanguageAnalysisValidationError,
  normalizeLanguageId,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ResolutionError extends Error {
    public readonly resolution: { kind: "MISSING_IMPLEMENTATION" };

    public constructor() {
      super("missing implementation");
      this.resolution = { kind: "MISSING_IMPLEMENTATION" };
    }
  }

  return {
    ResolutionError,
    executeCommand: vi.fn(),
    executeQuery: vi.fn(),
    executeLanguageAnalysis: vi.fn(),
    executeLanguageAnalysisBatch: vi.fn(),
    getDbHandle: vi.fn(async () => ({ client: {} })),
    resolvePluginManager: vi.fn(),
    resolveServiceImplementation: vi.fn(),
    getPolicyEpochQuery: Symbol("getLanguageAnalysisPolicyEpoch"),
    listSelectionsQuery: Symbol("listLanguageAnalysisSelections"),
    resolveSelectionQuery: Symbol("resolveLanguageAnalysisSelection"),
  };
});

vi.mock("@cat/domain", () => ({
  executeCommand: mocks.executeCommand,
  executeQuery: mocks.executeQuery,
  getLanguageAnalysisPolicyEpoch: mocks.getPolicyEpochQuery,
  getDbHandle: mocks.getDbHandle,
  listLanguageAnalysisSelections: mocks.listSelectionsQuery,
  resolveLanguageAnalysisSelection: mocks.resolveSelectionQuery,
  StaleLanguageAnalysisObservationError: class extends Error {},
  writeLanguageAnalysisObservation: Symbol("writeLanguageAnalysisObservation"),
}));

vi.mock("@cat/plugin-core", () => ({
  PluginServiceUnavailableError: class extends Error {},
}));

vi.mock("@cat/server-shared", () => ({
  ServiceImplementationResolutionError: mocks.ResolutionError,
  resolvePluginManager: mocks.resolvePluginManager,
  resolveServiceImplementation: mocks.resolveServiceImplementation,
}));

vi.mock("./language-analysis-execution.ts", () => ({
  executeLanguageAnalysis: mocks.executeLanguageAnalysis,
  executeLanguageAnalysisBatch: mocks.executeLanguageAnalysisBatch,
}));

import {
  assessLanguageAnalysisConfiguration,
  computeLanguageAnalysisConfigurationFingerprint,
  executeLanguageAnalysisReadinessAssessment,
  executeRequiredLanguageAnalysis,
  executeRequiredLanguageAnalysisBatch,
} from "./language-analysis-requirement.ts";

const implementation = ServiceImplementationReferenceSchema.parse({
  pluginId: "missing-analyzer",
  scopeId: "",
  scopeType: "GLOBAL",
  serviceId: "analyzer",
  serviceType: "LANGUAGE_ANALYZER",
});

const selection = {
  configurationFingerprint: "sha256:" + "a".repeat(64),
  implementation,
  key: "zh-Hans",
  revision: 4,
  updatedAt: new Date(),
};

describe("Language Analysis configuration assessment", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.executeQuery.mockResolvedValue({
      policyEpoch: 7,
      selection,
      tombstone: null,
    });
    mocks.resolvePluginManager.mockReturnValue({});
  });

  it("blocks a broken exact selection instead of resolving its wildcard fallback", async () => {
    mocks.resolveServiceImplementation.mockImplementation(() => {
      throw new mocks.ResolutionError();
    });

    await expect(
      assessLanguageAnalysisConfiguration({ languageId: "zh-Hans" }),
    ).resolves.toMatchObject({
      blocker: {
        implementation,
        reason: "MISSING_IMPLEMENTATION",
      },
      selection: { key: "zh-Hans", revision: 4 },
      status: "BLOCKED",
    });
  });

  it("blocks a non-global selection before it can resolve a scoped implementation", async () => {
    const scoped = ServiceImplementationReferenceSchema.parse({
      ...implementation,
      scopeId: "project-1",
      scopeType: "PROJECT",
    });
    mocks.executeQuery.mockResolvedValue({
      policyEpoch: 7,
      selection: { ...selection, implementation: scoped },
      tombstone: null,
    });

    await expect(
      assessLanguageAnalysisConfiguration({ languageId: "zh-Hans" }),
    ).resolves.toMatchObject({
      blocker: { reason: "INSTALLATION_SCOPE_MISMATCH" },
      status: "BLOCKED",
    });
    expect(mocks.resolveServiceImplementation).not.toHaveBeenCalled();
  });

  it("maps a malformed third-party configuration declaration to INVALID_CONFIGURATION", async () => {
    mocks.resolveServiceImplementation.mockReturnValue({
      getLanguageAnalysisConfigurationAssessment: () => ({
        semanticConfiguration: { invalid: undefined },
        status: "VALID",
        supportedLanguages: ["zh-hans", "zh-Hans"],
      }),
    });

    await expect(
      assessLanguageAnalysisConfiguration({ languageId: "zh-Hans" }),
    ).resolves.toMatchObject({
      blocker: { reason: "INVALID_CONFIGURATION" },
      status: "BLOCKED",
    });
  });

  it("rethrows the caller's cancellation reason instead of classifying it as unavailable", async () => {
    const reason = new Error("caller cancelled");
    const controller = new AbortController();
    controller.abort(reason);
    mocks.resolveServiceImplementation.mockImplementation(() => {
      throw new Error("transport cancelled");
    });

    await expect(
      assessLanguageAnalysisConfiguration(
        { languageId: "zh-Hans" },
        { signal: controller.signal, traceId: "test" },
      ),
    ).rejects.toBe(reason);
  });

  it("rethrows unknown execution errors without writing a false availability observation", async () => {
    const analyzer = {
      getLanguageAnalysisConfigurationAssessment: () => ({
        semanticConfiguration: {},
        status: "VALID" as const,
        supportedLanguages: [normalizeLanguageId("zh-Hans")],
      }),
    };
    const configurationFingerprint =
      computeLanguageAnalysisConfigurationFingerprint(
        implementation,
        "@example/analyzer",
        "1.0.0",
        [normalizeLanguageId("zh-Hans")],
        {},
      );
    mocks.executeQuery.mockResolvedValue({
      policyEpoch: 7,
      selection: { ...selection, configurationFingerprint },
      tombstone: null,
    });
    mocks.resolvePluginManager.mockReturnValue({
      getLoader: () => ({
        getData: async () => ({
          name: "@example/analyzer",
          version: "1.0.0",
        }),
      }),
    });
    mocks.resolveServiceImplementation.mockReturnValue(analyzer);
    const error = new Error("programmer error");
    mocks.executeLanguageAnalysis.mockRejectedValue(error);

    await expect(
      executeRequiredLanguageAnalysis(
        { languageId: "zh-Hans", text: "test" },
        { traceId: "test" },
      ),
    ).rejects.toBe(error);
  });

  it("timestamps a successful observation after host attestation validation completes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const analyzer = {
      getLanguageAnalysisConfigurationAssessment: () => ({
        semanticConfiguration: {},
        status: "VALID" as const,
        supportedLanguages: [normalizeLanguageId("zh-Hans")],
      }),
    };
    const configurationFingerprint =
      computeLanguageAnalysisConfigurationFingerprint(
        implementation,
        "@example/analyzer",
        "1.0.0",
        [normalizeLanguageId("zh-Hans")],
        {},
      );
    mocks.executeQuery.mockResolvedValue({
      policyEpoch: 7,
      selection: { ...selection, configurationFingerprint },
      tombstone: null,
    });
    mocks.resolvePluginManager.mockReturnValue({
      getLoader: () => ({
        getData: async () => ({
          name: "@example/analyzer",
          version: "1.0.0",
        }),
      }),
    });
    mocks.resolveServiceImplementation.mockReturnValue(analyzer);
    mocks.executeLanguageAnalysis.mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-08-01T00:00:30.000Z"));
      return { tokens: [] } as never;
    });

    await executeRequiredLanguageAnalysis(
      { languageId: "zh-Hans", text: "test" },
      { traceId: "test" },
    );

    expect(mocks.executeCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        observedAt: new Date("2026-08-01T00:00:30.000Z"),
        assessment: expect.objectContaining({
          assessedAt: new Date("2026-08-01T00:00:30.000Z"),
        }),
      }),
    );
  });

  it.each([
    ["single", "INVALID_RESPONSE"],
    ["batch", "INVALID_ATTESTATION"],
  ] as const)(
    "writes a typed observation for %s validation failure",
    async (kind, code) => {
      const analyzer = {
        getLanguageAnalysisConfigurationAssessment: () => ({
          semanticConfiguration: {},
          status: "VALID" as const,
          supportedLanguages: [normalizeLanguageId("zh-Hans")],
        }),
      };
      const configurationFingerprint =
        computeLanguageAnalysisConfigurationFingerprint(
          implementation,
          "@example/analyzer",
          "1.0.0",
          [normalizeLanguageId("zh-Hans")],
          {},
        );
      mocks.executeQuery.mockResolvedValue({
        policyEpoch: 7,
        selection: { ...selection, configurationFingerprint },
        tombstone: null,
      });
      mocks.resolvePluginManager.mockReturnValue({
        getLoader: () => ({
          getData: async () => ({
            name: "@example/analyzer",
            version: "1.0.0",
          }),
        }),
      });
      mocks.resolveServiceImplementation.mockReturnValue(analyzer);
      const error = new LanguageAnalysisValidationError(code, "invalid");
      mocks.executeLanguageAnalysis.mockRejectedValue(error);
      mocks.executeLanguageAnalysisBatch.mockRejectedValue(error);

      const promise =
        kind === "single"
          ? executeRequiredLanguageAnalysis({
              languageId: "zh-Hans",
              text: "test",
            })
          : executeRequiredLanguageAnalysisBatch({
              languageId: "zh-Hans",
              items: [{ id: "1", text: "test" }],
            });
      await expect(promise).rejects.toMatchObject({
        assessment: { blocker: { reason: code } },
      });
      expect(mocks.executeCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          assessment: expect.objectContaining({
            blocker: expect.objectContaining({ reason: code }),
          }),
        }),
      );
    },
  );

  it("deduplicates configuration while proving each effective language live", async () => {
    const supportedLanguages = Array.from({ length: 40 }, (_, index) =>
      normalizeLanguageId(`en-${String(index + 1).padStart(3, "0")}`),
    );
    const analyzer = {
      getLanguageAnalysisConfigurationAssessment: () => ({
        semanticConfiguration: {},
        status: "VALID" as const,
        supportedLanguages,
      }),
    };
    const configurationFingerprint =
      computeLanguageAnalysisConfigurationFingerprint(
        implementation,
        "@example/analyzer",
        "1.0.0",
        supportedLanguages,
        {},
      );
    const selections = supportedLanguages.map((languageId) => ({
      ...selection,
      key: languageId,
      configurationFingerprint,
    }));
    mocks.executeQuery.mockImplementation(async (_ctx, query, input) => {
      if (query === mocks.getPolicyEpochQuery) return 7;
      if (query === mocks.listSelectionsQuery) return selections;
      return {
        policyEpoch: 7,
        selection: selections.find((item) => item.key === input.languageId),
        tombstone: null,
      };
    });
    mocks.resolvePluginManager.mockReturnValue({
      getLoader: () => ({
        getData: async () => ({
          name: "@example/analyzer",
          version: "1.0.0",
        }),
      }),
    });
    mocks.resolveServiceImplementation.mockReturnValue(analyzer);
    mocks.executeLanguageAnalysis.mockResolvedValue({ tokens: [] } as never);

    await executeLanguageAnalysisReadinessAssessment({ traceId: "test" });

    expect(mocks.executeLanguageAnalysis).toHaveBeenCalledTimes(40);
    expect(
      mocks.executeLanguageAnalysis.mock.calls.map(
        ([input]) => input.languageId,
      ),
    ).toEqual(
      [...supportedLanguages].sort((left, right) => left.localeCompare(right)),
    );
  });

  it("rejects an unbounded effective-language readiness policy", async () => {
    const supportedLanguages = Array.from({ length: 129 }, (_, index) =>
      normalizeLanguageId(`en-${String(index + 1).padStart(3, "0")}`),
    );
    const analyzer = {
      getLanguageAnalysisConfigurationAssessment: () => ({
        semanticConfiguration: {},
        status: "VALID" as const,
        supportedLanguages,
      }),
    };
    const configurationFingerprint =
      computeLanguageAnalysisConfigurationFingerprint(
        implementation,
        "@example/analyzer",
        "1.0.0",
        supportedLanguages,
        {},
      );
    const selections = supportedLanguages.map((languageId) => ({
      ...selection,
      key: languageId,
      configurationFingerprint,
    }));
    mocks.executeQuery.mockImplementation(async (_ctx, query, input) => {
      if (query === mocks.getPolicyEpochQuery) return 7;
      if (query === mocks.listSelectionsQuery) return selections;
      return {
        policyEpoch: 7,
        selection: selections.find((item) => item.key === input.languageId),
        tombstone: null,
      };
    });
    mocks.resolvePluginManager.mockReturnValue({
      getLoader: () => ({
        getData: async () => ({ name: "@example/analyzer", version: "1.0.0" }),
      }),
    });
    mocks.resolveServiceImplementation.mockReturnValue(analyzer);

    await expect(
      executeLanguageAnalysisReadinessAssessment({ traceId: "test" }),
    ).rejects.toMatchObject({ reason: "INVALID_CONFIGURATION" });
    expect(mocks.executeLanguageAnalysis).not.toHaveBeenCalled();
  });

  it("uses the wildcard implementation for an exact tombstone readiness probe", async () => {
    const supportedLanguages = [
      normalizeLanguageId("en"),
      normalizeLanguageId("de"),
    ];
    const analyzer = {
      getLanguageAnalysisConfigurationAssessment: () => ({
        semanticConfiguration: {},
        status: "VALID" as const,
        supportedLanguages,
      }),
    };
    const configurationFingerprint =
      computeLanguageAnalysisConfigurationFingerprint(
        implementation,
        "@example/analyzer",
        "1.0.0",
        supportedLanguages,
        {},
      );
    const wildcard = {
      ...selection,
      key: "*",
      configurationFingerprint,
    };
    const tombstone = {
      ...selection,
      key: "de",
      implementation: null,
      configurationFingerprint: null,
    };
    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === mocks.getPolicyEpochQuery) return 7;
      if (query === mocks.listSelectionsQuery) return [wildcard, tombstone];
      return {
        policyEpoch: 7,
        selection: wildcard,
        tombstone,
      };
    });
    mocks.resolvePluginManager.mockReturnValue({
      getLoader: () => ({
        getData: async () => ({
          name: "@example/analyzer",
          version: "1.0.0",
        }),
      }),
    });
    mocks.resolveServiceImplementation.mockReturnValue(analyzer);
    mocks.executeLanguageAnalysis.mockResolvedValue({ tokens: [] } as never);

    await executeLanguageAnalysisReadinessAssessment({ traceId: "test" });

    expect(mocks.executeLanguageAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ languageId: "de" }),
      expect.anything(),
    );
  });

  it("retries the whole selection snapshot when the policy epoch changes", async () => {
    const supportedLanguages = [normalizeLanguageId("en")];
    const analyzer = {
      getLanguageAnalysisConfigurationAssessment: () => ({
        semanticConfiguration: {},
        status: "VALID" as const,
        supportedLanguages,
      }),
    };
    const configurationFingerprint =
      computeLanguageAnalysisConfigurationFingerprint(
        implementation,
        "@example/analyzer",
        "1.0.0",
        supportedLanguages,
        {},
      );
    const exact = {
      ...selection,
      key: "en",
      configurationFingerprint,
    };
    const policyEpochs = [1, 2, 2, 2];
    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === mocks.getPolicyEpochQuery) return policyEpochs.shift();
      if (query === mocks.listSelectionsQuery) return [exact];
      return { policyEpoch: 2, selection: exact, tombstone: null };
    });
    mocks.resolvePluginManager.mockReturnValue({
      getLoader: () => ({
        getData: async () => ({
          name: "@example/analyzer",
          version: "1.0.0",
        }),
      }),
    });
    mocks.resolveServiceImplementation.mockReturnValue(analyzer);
    mocks.executeLanguageAnalysis.mockResolvedValue({ tokens: [] } as never);

    await executeLanguageAnalysisReadinessAssessment({ traceId: "test" });

    expect(
      mocks.executeQuery.mock.calls.filter(
        ([, query]) => query === mocks.listSelectionsQuery,
      ),
    ).toHaveLength(2);
  });
});
