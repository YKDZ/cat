import { describe, expect, it } from "vitest";

import { listProjectLanguageAnalysisRequirements } from "./list-project-language-analysis-requirements.query.ts";

const rows = (values: Array<string | null>) => ({
  from: () => ({
    where: async () => values.map((languageId) => ({ languageId })),
  }),
});

describe("listProjectLanguageAnalysisRequirements", () => {
  it("combines persisted target and content/source languages canonically", async () => {
    const context = {
      db: {
        select: () => rows(["fr", "de"]),
        selectDistinct: () => rows(["en-us", "fr", null]),
      },
    } as never;

    await expect(
      listProjectLanguageAnalysisRequirements(context, {
        projectId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toEqual(["de", "en-US", "fr"]);
  });
});
