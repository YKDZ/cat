import { describe, expect, it } from "vitest";

import {
  PublishMemoryRecallDerivationCommandSchema,
  PublishTermRecallDerivationCommandSchema,
} from "#/commands/index.ts";
import {
  ListScopedMemoryRecallDerivationStatesQuerySchema,
  listScopedMemoryRecallDerivationStates,
} from "#/queries/recall-derivation/list-scoped-memory-recall-derivation-states.query.ts";
import {
  ListScopedTermRecallDerivationStatesQuerySchema,
  listScopedTermRecallDerivationStates,
} from "#/queries/recall-derivation/list-scoped-term-recall-derivation-states.query.ts";

const VERSION = `sha256:${"a".repeat(64)}`;
const LEASE_TOKEN = "00000000-0000-4000-8000-000000000000";

describe("Recall derivation language contracts", () => {
  it("canonicalizes equivalent scope and publication tags", () => {
    expect(
      ListScopedMemoryRecallDerivationStatesQuerySchema.parse({
        memoryIds: [],
        sourceLanguageId: "en-us",
        translationLanguageId: "zh-hans",
      }),
    ).toMatchObject({
      sourceLanguageId: "en-US",
      translationLanguageId: "zh-Hans",
    });
    expect(
      ListScopedTermRecallDerivationStatesQuerySchema.parse({
        glossaryIds: [],
        sourceLanguageId: "en-us",
        translationLanguageId: "zh-hans",
      }),
    ).toMatchObject({
      sourceLanguageId: "en-US",
      translationLanguageId: "zh-Hans",
    });
    expect(
      PublishMemoryRecallDerivationCommandSchema.parse({
        targetId: "1",
        memoryId: null,
        languageId: "en-us",
        demandRevision: 1,
        executionEpoch: 1,
        leaseToken: LEASE_TOKEN,
        canonicalInputVersion: VERSION,
        recallDerivationVersion: VERSION,
        variants: [],
      }),
    ).toMatchObject({ languageId: "en-US" });
    expect(
      PublishTermRecallDerivationCommandSchema.parse({
        targetId: "1",
        conceptId: null,
        languageId: "zh-hans",
        demandRevision: 1,
        executionEpoch: 1,
        leaseToken: LEASE_TOKEN,
        canonicalInputVersion: VERSION,
        recallDerivationVersion: VERSION,
        variants: [],
      }),
    ).toMatchObject({ languageId: "zh-Hans" });
  });

  it("rejects invalid tags before an empty scope can bypass validation", async () => {
    await expect(
      listScopedMemoryRecallDerivationStates(
        { db: undefined as never },
        {
          memoryIds: [],
          sourceLanguageId: "invalid language",
          translationLanguageId: "zh-Hans",
        },
      ),
    ).rejects.toThrow("Invalid BCP 47 language ID");
    await expect(
      listScopedTermRecallDerivationStates(
        { db: undefined as never },
        {
          glossaryIds: [],
          sourceLanguageId: "en-US",
          translationLanguageId: " zh-Hans ",
        },
      ),
    ).rejects.toThrow("Language IDs must not contain surrounding whitespace");
  });
});
