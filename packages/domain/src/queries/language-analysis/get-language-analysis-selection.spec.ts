import {
  LanguageAnalysisWildcardSelectionKey,
  normalizeLanguageId,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { describe, expect, it } from "vitest";

import { resolveLanguageAnalysisSelection } from "./get-language-analysis-selection.query.ts";

const selection = (key: string, implementation: object | null) => ({
  configurationFingerprint:
    implementation === null ? null : "sha256:" + "a".repeat(64),
  implementation,
  key,
  revision: 1,
  updatedAt: new Date(),
});

const implementation = ServiceImplementationReferenceSchema.parse({
  pluginId: "analyzer-plugin",
  scopeId: "",
  scopeType: "GLOBAL",
  serviceId: "analyzer",
  serviceType: "LANGUAGE_ANALYZER",
});

const contextFor = (...rows: Array<object | undefined>) => {
  let index = 0;
  const db = {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if ("epoch" in fields) return [{ epoch: 7 }];
            const row = rows[index++];
            return row === undefined ? [] : [row];
          },
        }),
      }),
    }),
  };
  // This is a deliberately tiny Drizzle query double for the public query.
  return { db } as never;
};

describe("resolveLanguageAnalysisSelection", () => {
  it("falls back to wildcard when an exact tombstone preserves a deleted revision", async () => {
    const result = await resolveLanguageAnalysisSelection(
      contextFor(
        selection("zh-Hans", null),
        selection(LanguageAnalysisWildcardSelectionKey, implementation),
      ),
      { languageId: normalizeLanguageId("zh-Hans") },
    );

    expect(result).toMatchObject({
      policyEpoch: 7,
      selection: { key: LanguageAnalysisWildcardSelectionKey },
      tombstone: { implementation: null, key: "zh-Hans" },
    });
  });

  it("uses wildcard only when no exact canonical selection record exists", async () => {
    const result = await resolveLanguageAnalysisSelection(
      contextFor(
        undefined,
        selection(LanguageAnalysisWildcardSelectionKey, implementation),
      ),
      { languageId: normalizeLanguageId("zh-Hant") },
    );

    expect(result).toMatchObject({
      policyEpoch: 7,
      selection: { key: LanguageAnalysisWildcardSelectionKey },
      tombstone: null,
    });
  });
});
