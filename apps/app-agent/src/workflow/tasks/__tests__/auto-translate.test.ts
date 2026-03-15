import {
  chunk,
  chunkSet,
  document,
  eq,
  getDrizzleDB,
  glossary,
  language,
  memory,
  project,
  sql,
  translatableElement,
  translatableString,
  user,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish, zip } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { autoTranslateWorkflow } from "../auto-translate";
import { createElementWorkflow } from "../create-element";
import { createTranslationWorkflow } from "../create-translation";

const data = [
  {
    text: "Test 1",
    languageId: "en",
    sortIndex: 1,
    meta: {},
    translation: {
      text: "测试 1",
      languageId: "zh-Hans",
    },
  },
  {
    text: "Test 2",
    languageId: "en",
    sortIndex: 2,
    meta: {},
    translation: {
      text: "测试 1",
      languageId: "zh-Hans",
    },
  },
  {
    text: "Test 3",
    languageId: "en",
    sortIndex: 3,
    meta: {},
    translation: {
      text: "测试 1",
      languageId: "zh-Hans",
    },
  },
];

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
      tx,
      // @ts-expect-error no need for hono
      {},
    );
  });

  await drizzle.transaction(async (tx) => {
    await tx.insert(language).values([{ id: "en" }, { id: "zh-Hans" }]);

    const { id: userId } = assertSingleNonNullish(
      await tx
        .insert(user)
        .values({
          email: "admin@encmys.cn",
          name: "YKDZ",
        })
        .returning({ id: user.id }),
    );

    const { id: projectId } = assertSingleNonNullish(
      await tx
        .insert(project)
        .values({
          name: "Test Project",
          creatorId: userId,
        })
        .returning({ id: project.id }),
    );

    await tx
      .insert(document)
      .values({
        creatorId: userId,
        projectId,
      })
      .returning({ id: document.id });

    await tx.insert(glossary).values({
      name: "Test",
      creatorId: userId,
    });

    await tx.insert(memory).values({
      name: "Test",
      creatorId: userId,
    });
  });
});

test("prepare elements & translation & memory", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { documentId } = assertSingleNonNullish(
    await drizzle.select({ documentId: document.id }).from(document).limit(1),
  );

  const { result: elementResult } = await createElementWorkflow.run({
    data: data.map((item) => ({
      ...item,
      documentId,
    })),
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { elementIds } = await elementResult();
  expect(elementIds.length).toEqual(data.length);

  const { id: memoryId } = assertSingleNonNullish(
    await drizzle.select({ id: memory.id }).from(memory),
  );

  const { result: translationResult } = await createTranslationWorkflow.run({
    data: Array.from(zip(elementIds, data)).map(([elementId, item]) => ({
      translatableElementId: elementId,
      text: item.translation.text,
      languageId: item.translation.languageId,
    })),
    memoryIds: [memoryId],
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
    translatorId: null,
  });

  const { translationIds, memoryItemIds } = await translationResult();
  expect(translationIds.length).toEqual(data.length);
  expect(memoryItemIds.length).toEqual(data.length);
});

test("worker should auto translate text", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { id: memoryId } = assertSingleNonNullish(
    await drizzle.select({ id: memory.id }).from(memory),
  );

  const { id: glossaryId } = assertSingleNonNullish(
    await drizzle.select({ id: glossary.id }).from(glossary),
  );

  const { id: elementId, chunkIds } = assertSingleNonNullish(
    await drizzle
      .select({
        id: translatableElement.id,
        chunkIds: sql<
          number[]
        >`coalesce(array_agg("Chunk"."id"), ARRAY[]::int[])`,
      })
      .from(translatableElement)
      .innerJoin(
        translatableString,
        eq(translatableElement.translatableStringId, translatableString.id),
      )
      .innerJoin(chunkSet, eq(translatableString.chunkSetId, chunkSet.id))
      .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
      .where(eq(translatableString.value, "Test 3"))
      .groupBy(translatableElement.id),
  );

  const { result } = await autoTranslateWorkflow.run({
    text: "Test 3",
    sourceLanguageId: "en",
    translationLanguageId: "zh-Hans",
    memoryIds: [memoryId],
    glossaryIds: [glossaryId],
    translatableElementId: elementId,
    chunkIds,
    vectorizerId: vectorizer.dbId,
    memoryVectorStorageId: vectorStorage.dbId,
    translationVectorStorageId: vectorStorage.dbId,
    minMemorySimilarity: 0.8,
    maxMemoryAmount: 3,
    translatorId: null,
  });

  const { translationIds } = await result();
  expect(translationIds?.length).toBeGreaterThan(0);
});
