import {
  chunkSet,
  document,
  eq,
  getColumns,
  getDrizzleDB,
  language,
  project,
  translatableElement,
  translatableString,
  user,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { diffElementsTask } from "../diff-elements";

const oldElements = [
  { text: "Test 1", languageId: "en", meta: { key: 1 }, sortIndex: 1 },
  { text: "Test 2", languageId: "en", meta: { key: 2 }, sortIndex: 2 },
  { text: "Test 3", languageId: "en", meta: { key: 3 }, sortIndex: 3 },
];

const newElements = [
  { text: "Test 1", languageId: "en", meta: { key: 1 }, sortIndex: 1 },
  {
    text: "Test Changed 2",
    languageId: "en",
    meta: { key: 2 },
    sortIndex: 3,
  },
  { text: "Test 3", languageId: "en", meta: { key: 3 }, sortIndex: 2 },
  { text: "Test New 4", languageId: "en", meta: { key: 4 }, sortIndex: 4 },
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
    await tx.insert(language).values([{ id: "en" }, { id: "zh_Hans" }]);

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

    const { id: documentId } = assertSingleNonNullish(
      await tx
        .insert(document)
        .values({
          creatorId: userId,
          projectId,
        })
        .returning({ id: document.id }),
    );

    for (const element of oldElements) {
      const { id: chunkSetId } = assertSingleNonNullish(
        // oxlint-disable-next-line no-await-in-loop
        await tx.insert(chunkSet).values({}).returning({ id: chunkSet.id }),
      );

      const { id } = assertSingleNonNullish(
        // oxlint-disable-next-line no-await-in-loop
        await tx
          .insert(translatableString)
          .values({
            chunkSetId,
            value: element.text,
            languageId: element.languageId,
          })
          .returning({ id: translatableString.id }),
      );

      // oxlint-disable-next-line no-await-in-loop
      await tx.insert(translatableElement).values({
        meta: element.meta,
        documentId,
        translatableStringId: id,
        sortIndex: element.sortIndex,
      });
    }
  });
});

test("worker should diff elements", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { documentId } = assertSingleNonNullish(
    await drizzle.select({ documentId: document.id }).from(document),
  );

  const oldElementIds = (
    await drizzle
      .select({ id: translatableElement.id })
      .from(translatableElement)
  ).map((item) => item.id);

  const { result } = await diffElementsTask.run({
    documentId,
    oldElementIds,
    elementData: newElements,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { addedElementIds, removedElementIds } = await result();
  expect(addedElementIds.length).toEqual(1);
  expect(removedElementIds.length).toEqual(0);

  const allElements = await drizzle
    .select({
      ...getColumns(translatableElement),
      ...getColumns(translatableString),
    })
    .from(translatableElement)
    .innerJoin(
      translatableString,
      eq(translatableElement.translatableStringId, translatableString.id),
    )
    .where(eq(translatableElement.documentId, documentId));

  expect(allElements.length).toEqual(4);
  expect(
    allElements.map((item) => item.sortIndex).sort((a, b) => a! - b!),
  ).toEqual([1, 2, 3, 4]);

  const changedElement = allElements.find((item) => {
    const meta = item.meta;
    return (
      typeof meta === "object" &&
      meta !== null &&
      !Array.isArray(meta) &&
      meta["key"] === 2
    );
  });

  expect(changedElement).toBeDefined();
  expect(changedElement?.value).toEqual("Test Changed 2");
  expect(changedElement?.sortIndex).toEqual(3);
});
