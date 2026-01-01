import { beforeAll, expect, test } from "vitest";
import {
  and,
  chunkSet,
  document,
  documentVersion,
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

    await tx.insert(documentVersion).values([
      {
        documentId,
        isActive: false,
      },
      {
        documentId,
        isActive: true,
      },
    ]);

    await Promise.all(
      oldElements.map(async (el) => {
        const { id: chunkSetId } = assertSingleNonNullish(
          await tx.insert(chunkSet).values({}).returning({ id: chunkSet.id }),
        );

        const { id } = assertSingleNonNullish(
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

        await tx.insert(translatableElement).values({
          meta: el.meta,
          documentId,
          translatableStringId: id,
          sortIndex: el.sortIndex,
        });
      }),
    );
  });
});

test("language should exists in db", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const langs = await drizzle.select(getColumns(language)).from(language);

  expect(langs.length).toEqual(2);
});

test("document and active version should exists in db", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const documents = await drizzle.select({ id: document.id }).from(document);
  const documentVersions = await drizzle
    .select({ id: documentVersion.id })
    .from(documentVersion)
    .where(eq(documentVersion.isActive, true));

  expect(documents.length).toEqual(1);
  expect(documentVersions.length).toEqual(1);
});

test("old elements should exists in db", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const elements = await drizzle
    .select({ id: translatableElement.id })
    .from(translatableElement);

  expect(elements.length).toEqual(3);
});

test("worker should diff elements", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { documentId, documentVersionId } = assertSingleNonNullish(
    await drizzle
      .select({
        documentId: document.id,
        documentVersionId: documentVersion.id,
      })
      .from(document)
      .innerJoin(
        documentVersion,
        and(
          eq(document.id, documentVersion.documentId),
          eq(documentVersion.isActive, true),
        ),
      ),
  );

  const oldElementIds = (
    await drizzle
      .select({ id: translatableElement.id })
      .from(translatableElement)
  ).map((el) => el.id);

  const { result } = await diffElementsTask.run({
    documentId,
    documentVersionId,
    oldElementIds,
    elementData: newElements,
  });

  const { addedElementIds, removedElementIds } = await result();

  expect(addedElementIds.length).toEqual(2);
  expect(removedElementIds.length).toEqual(1);

  const allElements = await drizzle
    .select({
      ...getColumns(translatableElement),
      ...getColumns(translatableString),
    })
    .from(translatableElement)
    .innerJoin(
      translatableString,
      eq(translatableElement.translatableStringId, translatableString.id),
    );

  expect(allElements.length).toEqual(4);
  expect(allElements.map((el) => el.sortIndex).sort((a, b) => a! - b!)).toEqual(
    [1, 2, 3, 4],
  );
});
