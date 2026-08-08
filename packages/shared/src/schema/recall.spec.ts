import { describe, expect, it } from "vitest";

import {
  RecallDebugContextSchema,
  RecallDerivationAffectedTargetSchema,
} from "#/schema/recall.ts";

describe("Recall language identity contracts", () => {
  it("canonicalizes language IDs on affected targets and debug context", () => {
    expect(
      RecallDerivationAffectedTargetSchema.parse({
        targetKind: "MEMORY_ITEM",
        targetId: "1",
        languageId: "en-us",
      }),
    ).toMatchObject({ languageId: "en-US" });
    expect(
      RecallDebugContextSchema.parse({ sourceLanguageId: "zh-hans" }),
    ).toMatchObject({ sourceLanguageId: "zh-Hans" });
  });

  it("rejects invalid or non-canonical boundary whitespace", () => {
    expect(() =>
      RecallDerivationAffectedTargetSchema.parse({
        targetKind: "TERM_CONCEPT",
        targetId: "1",
        languageId: " en-US ",
      }),
    ).toThrow("Language IDs must not contain surrounding whitespace");
    expect(() =>
      RecallDebugContextSchema.parse({ sourceLanguageId: "not a language" }),
    ).toThrow("Invalid BCP 47 language ID");
  });
});
