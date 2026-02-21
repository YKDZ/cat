import { afterAll, beforeAll, expect, test } from "vitest";
import {
  getColumns,
  getDrizzleDB,
  glossary,
  language,
  term,
  termConcept,
  user,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { lookupTerms } from "@cat/app-server-shared/utils";
import { createTermTask } from "../create-term.ts";
import type { TermData } from "@cat/shared/schema/misc";

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
    await tx.insert(language).values([
      {
        id: "en",
      },
      {
        id: "zh-Hans",
      },
    ]);

    const { id: userId } = assertSingleNonNullish(
      await tx
        .insert(user)
        .values({
          email: "admin@encmys.cn",
          name: "YKDZ",
        })
        .returning({ id: user.id }),
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
      .from(glossary)
      .limit(1),
  );

  const data = [
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

  const { result } = await createTermTask.run({
    glossaryId,
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { termIds } = await result();

  expect(termIds.length).toBe(termIds.length);

  const terms = await drizzle.select(getColumns(term)).from(term);
  const termConcepts = await drizzle
    .select(getColumns(termConcept))
    .from(termConcept);

  expect(terms.length).toBe(data.length * 2);
  expect(termConcepts.length).toBe(
    new Set(data.map((item) => item.definition)).size,
  );
});

test("lookupTerms should find matching terms", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { id: glossaryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: glossary.id,
      })
      .from(glossary),
  );

  const terms = await lookupTerms(drizzle, {
    glossaryIds: [glossaryId],
    text: "dirt",
    sourceLanguageId: "en",
    translationLanguageId: "zh-Hans",
  });

  expect(terms.length).toBeGreaterThan(0);
});
