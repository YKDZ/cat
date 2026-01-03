import { beforeAll, expect, test } from "vitest";
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
import { PluginRegistry } from "@cat/plugin-core";
import { assertSingleNonNullish, zip } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { createElementWorkflow } from "../create-element.ts";
import { createTranslationWorkflow } from "../create-translation.ts";
import { autoTranslateWorkflow } from "../auto-translate.ts";

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

beforeAll(async () => {
  const { client: drizzle } = await setupTestDB();

  const pluginRegistry = PluginRegistry.get(
    "GLOBAL",
    "",
    new TestPluginLoader(),
  );

  await pluginRegistry.importAvailablePlugins(drizzle);
  await pluginRegistry.installPlugin(drizzle, "mock");
  // @ts-expect-error no need for hono here
  await pluginRegistry.enableAllPlugins(drizzle, {});

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

    const { id: projectId } = assertSingleNonNullish(
      await tx
        .insert(project)
        .values({
          name: "Test Project",
          creatorId: userId,
        })
        .returning({
          id: project.id,
        }),
    );

    await tx
      .insert(document)
      .values({
        creatorId: userId,
        projectId,
      })
      .returning({
        id: document.id,
      });

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

  const { documentId } = assertSingleNonNullish(
    await drizzle
      .select({
        documentId: document.id,
      })
      .from(document)
      .limit(1),
  );

  const { result: elementResult } = await createElementWorkflow.run({
    data: data.map((d) => ({
      ...d,
      documentId,
    })),
  });

  const { elementIds } = await elementResult();

  expect(elementIds.length).toEqual(data.length);

  const { id: memoryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: memory.id,
      })
      .from(memory),
  );

  const { result: translationResult } = await createTranslationWorkflow.run({
    data: Array.from(zip(elementIds, data)).map(([elementId, tData]) => ({
      translatableElementId: elementId,
      ...tData.translation,
    })),
    memoryIds: [memoryId],
  });

  const { translationIds, memoryItemIds } = await translationResult();

  expect(translationIds.length).toEqual(data.length);
  expect(memoryItemIds.length).toEqual(data.length);
});

test("worker should auto translate text", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { id: memoryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: memory.id,
      })
      .from(memory),
  );

  const { id: glossaryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: glossary.id,
      })
      .from(glossary),
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
  });

  const { translationIds } = await result();

  expect(translationIds?.length).toBeGreaterThan(0);
});
