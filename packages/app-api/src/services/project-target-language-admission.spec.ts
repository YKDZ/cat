import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assessLanguageAnalysisConfiguration: vi.fn(),
  executeCommand: vi.fn(),
}));

vi.mock("@cat/operations", () => ({
  assessLanguageAnalysisConfiguration:
    mocks.assessLanguageAnalysisConfiguration,
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return { ...actual, executeCommand: mocks.executeCommand };
});

import { prepareProjectTargetLanguageAdmission } from "./project-target-language-admission.ts";

describe("project target language admission", () => {
  beforeEach(() => {
    mocks.assessLanguageAnalysisConfiguration.mockReset();
    mocks.assessLanguageAnalysisConfiguration.mockResolvedValue({
      status: "SATISFIED",
      policyEpoch: 7,
    });
    mocks.executeCommand.mockReset();
  });

  it("guards canonical, deduplicated targets before exposing the write", async () => {
    const admission = await prepareProjectTargetLanguageAdmission(
      ["en-us", "en-US"],
      {
        drizzleDB: { client: {} },
        pluginManager: {},
        requestSignal: new AbortController().signal,
      } as never,
    );

    expect(mocks.assessLanguageAnalysisConfiguration).toHaveBeenCalledTimes(1);
    expect(mocks.assessLanguageAnalysisConfiguration).toHaveBeenCalledWith(
      { languageId: "en-US" },
      expect.objectContaining({
        db: expect.anything(),
        traceId: "language-analysis-preflight",
      }),
    );

    const db = {} as never;
    await admission.write(db, "11111111-1111-4111-8111-111111111111");
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      { db },
      expect.any(Function),
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        languageIds: ["en-US"],
      },
    );
  });

  it("keeps oRPC target writes behind the guarded application service", async () => {
    const routerSource = await readFile(
      new URL("../orpc/routers/project.ts", import.meta.url),
      "utf8",
    );

    expect(routerSource).not.toContain("addProjectTargetLanguages");
    expect(routerSource).toContain("prepareProjectTargetLanguageAdmission");
  });
});
