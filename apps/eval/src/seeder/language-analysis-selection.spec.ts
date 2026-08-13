import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  executeQuery: vi.fn(),
  validateLanguageAnalyzerConfiguration: vi.fn(),
}));

vi.mock("@cat/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/domain")>()),
  executeCommand: mocks.executeCommand,
  executeQuery: mocks.executeQuery,
}));
vi.mock("@cat/operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/operations")>()),
  validateLanguageAnalyzerConfiguration:
    mocks.validateLanguageAnalyzerConfiguration,
}));

import {
  ensureEvalLanguageAnalysisSelection,
  EvalLanguageAnalysisSelectionError,
} from "./seeder.ts";

const implementation = {
  pluginId: "spacy-language-analyzer",
  serviceId: "spacy-language-analyzer",
  serviceType: "LANGUAGE_ANALYZER",
  scopeType: "GLOBAL",
  scopeId: "",
} as const;
const fingerprint = `sha256:${"a".repeat(64)}`;
const overrides = [
  {
    plugin: "spacy-language-analyzer",
    scope: "GLOBAL" as const,
    config: { serverUrl: "http://spacy.test" },
  },
];

const createManager = (withService = true) =>
  ({
    getLoader: vi.fn(() => ({
      getManifest: vi.fn(async () => ({
        services: [
          {
            id: "spacy-language-analyzer",
            type: "LANGUAGE_ANALYZER",
          },
        ],
      })),
    })),
    getServices: vi.fn(() =>
      withService
        ? [
            {
              id: "spacy-language-analyzer",
              pluginId: "spacy-language-analyzer",
            },
          ]
        : [],
    ),
    createServiceImplementationReference: vi.fn(() => implementation),
  }) as never;

describe("ensureEvalLanguageAnalysisSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateLanguageAnalyzerConfiguration.mockResolvedValue({
      fingerprint,
    });
  });

  it("hard-fails before seeding when the configured spaCy service is absent", async () => {
    await expect(
      ensureEvalLanguageAnalysisSelection(
        {} as never,
        createManager(false),
        overrides,
      ),
    ).rejects.toMatchObject({
      name: "EvalLanguageAnalysisSelectionError",
      code: "CONFIGURED_SERVICE_UNAVAILABLE",
    } satisfies Partial<EvalLanguageAnalysisSelectionError>);
    expect(mocks.executeQuery).not.toHaveBeenCalled();
  });

  it("accepts only a fresh selection with the same canonical implementation", async () => {
    mocks.executeQuery.mockResolvedValue({
      implementation,
      configurationFingerprint: fingerprint,
      revision: 1,
    });

    await expect(
      ensureEvalLanguageAnalysisSelection(
        {} as never,
        createManager(),
        overrides,
      ),
    ).resolves.toBeUndefined();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it("updates a stale selection using its explicit revision", async () => {
    mocks.executeQuery.mockResolvedValue({
      implementation: { ...implementation, serviceId: "different" },
      configurationFingerprint: fingerprint,
      revision: 4,
    });

    await ensureEvalLanguageAnalysisSelection(
      {} as never,
      createManager(),
      overrides,
    );
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        expectedRevision: 4,
        implementation,
        configurationFingerprint: fingerprint,
      }),
    );
  });

  it("accepts a fresh conflict winner after re-reading the selection", async () => {
    mocks.executeQuery.mockResolvedValueOnce(null).mockResolvedValueOnce({
      implementation,
      configurationFingerprint: fingerprint,
      revision: 1,
    });
    const conflict = new (
      await import("@cat/domain")
    ).LanguageAnalysisSelectionConflictError();
    mocks.executeCommand.mockRejectedValueOnce(conflict);

    await expect(
      ensureEvalLanguageAnalysisSelection(
        {} as never,
        createManager(),
        overrides,
      ),
    ).resolves.toBeUndefined();
    expect(mocks.executeCommand).toHaveBeenCalledOnce();
  });

  it("accepts the canonical winner after a second CAS conflict", async () => {
    mocks.executeQuery
      .mockResolvedValueOnce({
        implementation: { ...implementation, serviceId: "stale" },
        configurationFingerprint: fingerprint,
        revision: 1,
      })
      .mockResolvedValueOnce({
        implementation: { ...implementation, serviceId: "still-stale" },
        configurationFingerprint: fingerprint,
        revision: 2,
      })
      .mockResolvedValueOnce({
        implementation,
        configurationFingerprint: fingerprint,
        revision: 3,
      });
    const conflict = new (
      await import("@cat/domain")
    ).LanguageAnalysisSelectionConflictError();
    mocks.executeCommand.mockRejectedValue(conflict);

    await expect(
      ensureEvalLanguageAnalysisSelection(
        {} as never,
        createManager(),
        overrides,
      ),
    ).resolves.toBeUndefined();
    expect(mocks.executeCommand).toHaveBeenCalledTimes(2);
  });

  it("fails typefully when the second CAS winner is still stale", async () => {
    mocks.executeQuery.mockResolvedValue({
      implementation: { ...implementation, serviceId: "stale" },
      configurationFingerprint: fingerprint,
      revision: 1,
    });
    const conflict = new (
      await import("@cat/domain")
    ).LanguageAnalysisSelectionConflictError();
    mocks.executeCommand.mockRejectedValue(conflict);

    await expect(
      ensureEvalLanguageAnalysisSelection(
        {} as never,
        createManager(),
        overrides,
      ),
    ).rejects.toMatchObject({ code: "SELECTION_WRITE_CONFLICT" });
  });
});
