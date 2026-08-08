import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assessLanguageAnalysisConfiguration: vi.fn(),
  executeQuery: vi.fn(),
}));

vi.mock("@cat/operations", () => ({
  assessLanguageAnalysisConfiguration:
    mocks.assessLanguageAnalysisConfiguration,
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return { ...actual, executeQuery: mocks.executeQuery };
});

import { assertProjectLanguageAnalysisPreflight } from "./language-analysis-preflight.ts";

describe("source file Language Analysis preflight", () => {
  beforeEach(() => {
    mocks.assessLanguageAnalysisConfiguration.mockReset();
    mocks.assessLanguageAnalysisConfiguration.mockResolvedValue({
      status: "SATISFIED",
      policyEpoch: 7,
    });
    mocks.executeQuery.mockReset();
    mocks.executeQuery.mockResolvedValue(["en", "fr"]);
  });

  it("assesses target, admitted content, and every incoming language without changing membership", async () => {
    await assertProjectLanguageAnalysisPreflight(
      "11111111-1111-4111-8111-111111111111",
      ["de", "iw"],
      {
        pluginManager: {},
        requestSignal: new AbortController().signal,
        drizzleDB: { client: {} },
      } as never,
    );

    expect(mocks.executeQuery).toHaveBeenCalledWith(
      { db: expect.anything() },
      expect.any(Function),
      { projectId: "11111111-1111-4111-8111-111111111111" },
    );
    expect(mocks.assessLanguageAnalysisConfiguration.mock.calls).toEqual([
      [
        { languageId: "de" },
        expect.objectContaining({
          db: expect.anything(),
          traceId: "language-analysis-preflight",
        }),
      ],
      [
        { languageId: "en" },
        expect.objectContaining({
          db: expect.anything(),
          traceId: "language-analysis-preflight",
        }),
      ],
      [
        { languageId: "fr" },
        expect.objectContaining({
          db: expect.anything(),
          traceId: "language-analysis-preflight",
        }),
      ],
      [
        { languageId: "he" },
        expect.objectContaining({
          db: expect.anything(),
          traceId: "language-analysis-preflight",
        }),
      ],
    ]);
  });

  it("blocks collection admission before its canonical graph write", async () => {
    mocks.assessLanguageAnalysisConfiguration.mockResolvedValue({
      status: "BLOCKED",
      policyEpoch: 7,
      blocker: { reason: "MISSING_SELECTION", retryable: false },
    });

    await expect(
      assertProjectLanguageAnalysisPreflight(
        "11111111-1111-4111-8111-111111111111",
        ["en"],
        {
          pluginManager: {},
          requestSignal: new AbortController().signal,
          drizzleDB: { client: {} },
        } as never,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const source = await readFile(
      new URL("../orpc/routers/collection.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("assertProjectLanguageAnalysisPreflight");
    expect(source).toContain("languageAnalysisPolicySnapshot");
  });
});
