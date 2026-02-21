import { afterAll, beforeAll, expect, test } from "vitest";
import {
  eq,
  getColumns,
  getDrizzleDB,
  glossary,
  isNotNull,
  language,
  term,
  termConcept,
  translatableString,
  user,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { createTermTask } from "../create-term.ts";
import type { TermData } from "@cat/shared/schema/misc";

const data = [
  {
    definition: "Name of YKDZ",
    term: "YKDZ",
    termLanguageId: "en",
    translation: "一颗丁子",
    translationLanguageId: "zh-Hans",
  },
  {
    definition: "Minecraft block",
    term: "dirt",
    termLanguageId: "en",
    translation: "泥土",
    translationLanguageId: "zh-Hans",
  },
  {
    definition: "Minecraft block",
    term: "diamond block",
    termLanguageId: "en",
    translation: "钻石块",
    translationLanguageId: "zh-Hans",
  },
] satisfies TermData[];

let cleanup: () => Promise<void>;

afterAll(async () => {
  await cleanup?.();
});

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;
  const drizzle = db.client;

  const pluginManager = PluginManager.get("GLOBAL", "", new TestPluginLoader());

  await pluginManager.getDiscovery().syncDefinitions(drizzle);
  await pluginManager.install(drizzle, "mock");
  await drizzle.transaction(async (tx) => {
    await pluginManager.restore(
      tx, // @ts-expect-error no need for hono
      {},
    );
  });

  // Seed
  await drizzle.transaction(async (tx) => {
    await tx.insert(language).values([{ id: "en" }, { id: "zh-Hans" }]);

    const { id: userId } = assertSingleNonNullish(
      await tx
        .insert(user)
        .values({
          email: "admin@encmys.cn",
          name: "Test",
        })
        .returning({
          id: user.id,
        }),
    );

    await tx.insert(glossary).values({
      name: "Test",
      creatorId: userId,
    });
  });
});

test("create-term should insert and return term", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { id: glossaryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: glossary.id,
      })
      .from(glossary),
  );

  const { result } = await createTermTask.run({
    glossaryId,
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { termIds } = await result();

  const terms = await drizzle.select(getColumns(term)).from(term);

  expect(terms.length).toBe(termIds.length);

  const flatRows = await drizzle
    .select({
      entryId: termConcept.id,
      subject: termConcept.definition,
      termValue: translatableString.value,
    })
    .from(termConcept)
    .leftJoin(term, eq(termConcept.id, term.termConceptId))
    .leftJoin(translatableString, eq(term.stringId, translatableString.id))
    .where(isNotNull(termConcept.definition));

  const expectedFlatList = data.flatMap((item) => [
    { subject: item.definition, termValue: item.term },
    { subject: item.definition, termValue: item.translation },
  ]);

  const actualFlatList = flatRows.map((row) => ({
    subject: row.subject,
    termValue: row.termValue,
  }));

  expect(actualFlatList).toHaveLength(expectedFlatList.length);
  expect(actualFlatList).toEqual(expect.arrayContaining(expectedFlatList));
});
