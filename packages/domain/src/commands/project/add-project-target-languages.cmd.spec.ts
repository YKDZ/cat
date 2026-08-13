import { describe, expect, it, vi } from "vitest";

import { addProjectTargetLanguages } from "./add-project-target-languages.cmd.ts";

describe("addProjectTargetLanguages", () => {
  it("validates and canonicalizes language IDs at the domain boundary", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));

    await addProjectTargetLanguages(
      { db: { insert } as never },
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        languageIds: ["en-us", "zh-hant-tw"],
      },
    );

    expect(values).toHaveBeenCalledWith([
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        languageId: "en-US",
      },
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        languageId: "zh-Hant-TW",
      },
    ]);
  });

  it("rejects malformed language IDs before writing", async () => {
    const insert = vi.fn();

    await expect(
      addProjectTargetLanguages(
        { db: { insert } as never },
        {
          projectId: "11111111-1111-4111-8111-111111111111",
          languageIds: ["not a language"],
        },
      ),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});
