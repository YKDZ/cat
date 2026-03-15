import {
  eq,
  getColumns,
  getDrizzleDB,
  language,
  translatableString,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish, zip } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createTranslatableStringTask } from "../create-translatable-string";

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

  await drizzle.insert(language).values([{ id: "en" }, { id: "zh-Hans" }]);
});

test("worker should insert strings to db", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const data = [
    { text: "Text 1", languageId: "en" },
    { text: "Text 2", languageId: "en" },
    { text: "Text 3", languageId: "en" },
  ];

  const { result } = await createTranslatableStringTask.run({
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { stringIds } = await result();
  const strings = await drizzle
    .select(getColumns(translatableString))
    .from(translatableString);

  expect(strings.length).toEqual(data.length);

  for (const [stringId, stringData] of zip(stringIds, data)) {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await drizzle
      .select({ value: translatableString.value })
      .from(translatableString)
      .where(eq(translatableString.id, stringId));

    expect(rows.length).toEqual(1);
    expect(rows[0]?.value).toEqual(stringData.text);
  }
});

test("empty input should return empty array", async () => {
  const data: Array<{ text: string; languageId: string }> = [];
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { result } = await createTranslatableStringTask.run({
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { stringIds } = await result();
  expect(stringIds.length).toEqual(0);
});

test("worker should reuse existing strings", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const data = [{ text: "Duplicate Text", languageId: "en" }];

  const { result: result1 } = await createTranslatableStringTask.run({
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });
  const { stringIds: ids1 } = await result1();

  const { result: result2 } = await createTranslatableStringTask.run({
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });
  const { stringIds: ids2 } = await result2();

  expect(ids1[0]).toEqual(ids2[0]);

  const strings = await drizzle
    .select()
    .from(translatableString)
    .where(eq(translatableString.value, "Duplicate Text"));

  expect(strings).toHaveLength(1);
});
