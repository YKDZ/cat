import { describe, expect, it } from "vitest";

import type { ChangesetEntry } from "../application-method.ts";
import { VectorizedStringApplicationMethod } from "./vectorized-string-application-method.ts";

const entry = (after: ChangesetEntry["after"]): ChangesetEntry => ({
  action: "CREATE",
  after,
  asyncStatus: null,
  before: null,
  changesetId: 1,
  entityId: "translation-candidate-1",
  entityType: "translation",
  fieldPath: null,
  id: 1,
  reviewStatus: "APPROVED",
  riskLevel: "LOW",
});

describe("translation materialization validation", () => {
  const method = new VectorizedStringApplicationMethod("translation");

  it("fails when the database capability is missing", async () => {
    await expect(
      method.applyCreate(
        entry({
          languageId: "zh-Hans",
          text: "translated",
          translatableElementId: 1,
        }),
        { projectId: "project-1" },
      ),
    ).resolves.toMatchObject({
      status: "FAILED",
      errorMessage: expect.stringContaining("requires db"),
    });
  });

  it.each([null, {}, { languageId: "zh-Hans", text: "translated" }])(
    "fails for invalid translation payload %j",
    async (after) => {
      await expect(
        method.applyCreate(entry(after), {
          projectId: "project-1",
          // The invalid payload returns before this boundary is used.
          db: {} as never,
        }),
      ).resolves.toMatchObject({
        status: "FAILED",
        errorMessage: expect.stringContaining("Invalid translation payload"),
      });
    },
  );
});
