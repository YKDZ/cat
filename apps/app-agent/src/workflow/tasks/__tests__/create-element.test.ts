import {
  document,
  eq,
  getColumns,
  language,
  project,
  translatableElement,
  translatableString,
  user,
} from "@cat/db";
import { getDbHandle } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish, zip } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createElementWorkflow } from "../create-element";

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
  });
});

test("worker should create element, store it and return ids in order", async () => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const data = [
    { text: "Text 1", languageId: "en", sortIndex: 1 },
    { text: "Text 2", languageId: "en", sortIndex: 2 },
    { text: "Text 3", languageId: "en", sortIndex: 3 },
  ];

  const { documentId } = assertSingleNonNullish(
    await drizzle.select({ documentId: document.id }).from(document).limit(1),
  );

  const { result } = await createElementWorkflow.run({
    data: data.map((item) => ({
      ...item,
      documentId,
    })),
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { elementIds } = await result();
  const elements = await drizzle
    .select(getColumns(translatableElement))
    .from(translatableElement);

  expect(elements.length).toEqual(data.length);

  for (const [elementId, elementData] of zip(elementIds, data)) {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await drizzle
      .select({ value: translatableString.value })
      .from(translatableElement)
      .innerJoin(
        translatableString,
        eq(translatableString.id, translatableElement.translatableStringId),
      )
      .where(eq(translatableElement.id, elementId));

    expect(rows.length).toEqual(1);
    expect(rows[0]?.value).toEqual(elementData.text);
  }
});
