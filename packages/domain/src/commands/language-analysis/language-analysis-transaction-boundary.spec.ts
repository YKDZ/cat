import { LanguageAnalysisWildcardSelectionKey } from "@cat/shared";
import { describe, expect, it } from "vitest";

import {
  writeLanguageAnalysisObservation,
  writeValidatedLanguageAnalysisSelection,
} from "#/commands/index.ts";

describe("Language Analysis policy transaction boundary", () => {
  it("refuses selection writes without a transaction-capable database", async () => {
    await expect(
      writeValidatedLanguageAnalysisSelection(
        { db: {} as never },
        {
          key: LanguageAnalysisWildcardSelectionKey,
          expectedRevision: 0,
          implementation: null,
          configurationFingerprint: null,
        },
      ),
    ).rejects.toThrow("transaction-capable database handle");
  });

  it("refuses observation writes without a transaction-capable database", async () => {
    await expect(
      writeLanguageAnalysisObservation({ db: {} as never }, {} as never),
    ).rejects.toThrow("transaction-capable database handle");
  });
});
