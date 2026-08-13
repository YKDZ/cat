import { describe, expect, it } from "vitest";

import {
  PublishMemoryRecallDerivationCommandSchema,
  PublishTermRecallDerivationCommandSchema,
} from "#/commands/index.ts";
import {
  ListGlossariesByCreatorQuerySchema,
  listGlossariesByCreator,
} from "#/queries/glossary/list-glossaries-by-creator.query.ts";
import {
  ListLexicalTermSuggestionsQuerySchema,
  listLexicalTermSuggestions,
} from "#/queries/glossary/list-lexical-term-suggestions.query.ts";
import { GetSearchMemoryChunkRangeQuerySchema } from "#/queries/memory/get-search-memory-chunk-range.query.ts";
import { ListExactMemorySuggestionsQuerySchema } from "#/queries/memory/list-lexical-memory-suggestions.query.ts";
import {
  ListMemoriesByCreatorQuerySchema,
  listMemoriesByCreator,
} from "#/queries/memory/list-memories-by-creator.query.ts";
import {
  ListAccessibleProjectsQuerySchema,
  listAccessibleProjects,
} from "#/queries/project/list-accessible-projects.query.ts";
import { ListProjectsByCreatorQuerySchema } from "#/queries/project/list-projects-by-creator.query.ts";
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

  it("parses canonical language IDs before an empty scope returns", async () => {
    await expect(
      listScopedMemoryRecallDerivationStates(
        { db: undefined as never },
        {
          memoryIds: [],
          sourceLanguageId: "en-us",
          translationLanguageId: "zh-hans",
        },
      ),
    ).resolves.toEqual([]);
  });

  it("validates resource list input before a scoped empty result", async () => {
    await expect(
      listAccessibleProjects(
        { db: undefined as never },
        { projectIds: [], pageIndex: -1, pageSize: 1 },
      ),
    ).rejects.toThrow("Too small");
    await expect(
      listMemoriesByCreator(
        { db: undefined as never },
        { creatorId: "not-a-uuid", pagination: "unpaged" },
      ),
    ).rejects.toThrow("Invalid UUID");
    await expect(
      listGlossariesByCreator(
        { db: undefined as never },
        { creatorId: "not-a-uuid", pagination: "unpaged" },
      ),
    ).rejects.toThrow("Invalid UUID");
  });

  it("requires explicit, bounded resource list pagination", () => {
    const projectIds = ["11111111-1111-4111-8111-111111111111"];
    const creatorId = "22222222-2222-4222-8222-222222222222";
    expect(
      ListAccessibleProjectsQuerySchema.safeParse({
        pageIndex: 0,
        projectIds,
      }).success,
    ).toBe(false);
    expect(
      ListAccessibleProjectsQuerySchema.safeParse({
        pageIndex: 0,
        pageSize: 101,
        projectIds,
      }).success,
    ).toBe(false);
    expect(
      ListAccessibleProjectsQuerySchema.safeParse({
        pagination: "unpaged",
        projectIds,
        sort: { desc: false, id: "createdAt" },
      }).success,
    ).toBe(true);
    expect(
      ListAccessibleProjectsQuerySchema.safeParse({
        pageIndex: 0,
        pageSize: 10,
        projectIds,
        sort: { desc: false, id: "description" },
      }).success,
    ).toBe(false);
    expect(
      ListMemoriesByCreatorQuerySchema.safeParse({
        creatorId,
        pageIndex: 0,
      }).success,
    ).toBe(false);
    expect(
      ListProjectsByCreatorQuerySchema.safeParse({
        creatorId,
        pageSize: 10,
      }).success,
    ).toBe(false);
    expect(
      ListGlossariesByCreatorQuerySchema.safeParse({
        creatorId,
        pageIndex: 0,
        pageSize: 101,
      }).success,
    ).toBe(false);
    expect(
      ListMemoriesByCreatorQuerySchema.safeParse({
        creatorId,
        pagination: "unpaged",
      }).success,
    ).toBe(true);
    expect(
      ListGlossariesByCreatorQuerySchema.safeParse({
        creatorId,
        pagination: "unpaged",
      }).success,
    ).toBe(true);
  });

  it("normalizes language IDs at direct recall query boundaries", async () => {
    expect(
      ListExactMemorySuggestionsQuerySchema.parse({
        text: "source",
        sourceLanguageId: "en-us",
        translationLanguageId: "zh-hans",
        memoryIds: [],
        maxAmount: 1,
      }),
    ).toMatchObject({
      sourceLanguageId: "en-US",
      translationLanguageId: "zh-Hans",
    });
    await expect(
      listLexicalTermSuggestions(
        { db: undefined as never },
        {
          glossaryIds: [],
          text: "source",
          sourceLanguageId: "invalid language",
          translationLanguageId: "zh-Hans",
        },
      ),
    ).rejects.toThrow("Invalid BCP 47 language ID");
    await expect(
      listLexicalTermSuggestions(
        { db: undefined as never },
        {
          glossaryIds: [],
          text: "source",
          sourceLanguageId: "en-us",
          translationLanguageId: "zh-hans",
        },
      ),
    ).resolves.toEqual([]);
    expect(
      ListLexicalTermSuggestionsQuerySchema.parse({
        glossaryIds: [],
        text: "source",
        sourceLanguageId: "en-us",
        translationLanguageId: "zh-hans",
      }),
    ).toMatchObject({ sourceLanguageId: "en-US" });
    expect(
      GetSearchMemoryChunkRangeQuerySchema.parse({
        memoryIds: [],
        sourceLanguageId: "en-us",
        translationLanguageId: "zh-hans",
      }),
    ).toMatchObject({ translationLanguageId: "zh-Hans" });
  });
});
