import { beforeAll, expect, test } from "vitest";
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
import { PluginRegistry } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { diffElementsTask } from "@/workers/diff-elements.ts";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";

const oldElements = [
  {
    text: "Test 1",
    languageId: "en",
    meta: { key: 1 },
    sortIndex: 1,
  },
  {
    text: "Test 2",
    languageId: "en",
    meta: { key: 2 },
    sortIndex: 2,
  },
  {
    text: "Test 3",
    languageId: "en",
    meta: { key: 3 },
    sortIndex: 3,
  },
];

const newElements = [
  {
    text: "Test 1",
    languageId: "en",
    meta: { key: 1 },
    sortIndex: 1,
  },
  {
    text: "Test Changed 2",
    languageId: "en",
    meta: { key: 2 },
    // 排序不参与 diff，但也要被更新
    sortIndex: 3,
  },
  {
    text: "Test 3",
    languageId: "en",
    meta: { key: 3 },
    // 排序不参与 diff，但也要被更新
    sortIndex: 2,
  },
  {
    text: "Test New 4",
    languageId: "en",
    // 新增一个元素
    meta: { key: 4 },
    sortIndex: 4,
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
        id: "zh_Hans",
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

    const { id: documentId } = assertSingleNonNullish(
      await tx
        .insert(document)
        .values({
          creatorId: userId,
          projectId,
        })
        .returning({
          id: document.id,
        }),
    );

    for (const el of oldElements) {
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
            value: el.text,
            languageId: el.languageId,
          })
          .returning({
            id: translatableString.id,
          }),
      );

      // oxlint-disable-next-line no-await-in-loop
      await tx.insert(translatableElement).values({
        meta: el.meta,
        documentId,
        translatableStringId: id,
        sortIndex: el.sortIndex,
      });
    }
  });
});

test("worker should diff elements", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { documentId } = assertSingleNonNullish(
    await drizzle
      .select({
        documentId: document.id,
      })
      .from(document),
  );

  const oldElementIds = (
    await drizzle
      .select({ id: translatableElement.id })
      .from(translatableElement)
  ).map((el) => el.id);

  const { result } = await diffElementsTask.run({
    documentId,
    oldElementIds,
    elementData: newElements,
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
  expect(allElements.map((el) => el.sortIndex).sort((a, b) => a! - b!)).toEqual(
    [1, 2, 3, 4],
  );

  const changedElement = allElements.find(
    // oxlint-disable-next-line no-unsafe-type-assertion
    (el) => (el.meta as { key: number }).key === 2,
  );
  expect(changedElement).toBeDefined();
  expect(changedElement!.value).toEqual("Test Changed 2");
  expect(changedElement!.sortIndex).toEqual(3);
});
