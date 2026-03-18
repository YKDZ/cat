import {
  ensureLanguages,
  getStringByValue,
  listTranslatableStringsById,
  executeCommand,
  getDbHandle,
  executeQuery,
} from "@cat/domain";
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

  await executeCommand({ db: drizzle }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
});

test("worker should insert strings to db", async () => {
  const pluginManager = PluginManager.get("GLOBAL", "");
  const { client } = await getDbHandle();

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
  const strings = await executeQuery(
    { db: client },
    listTranslatableStringsById,
    {
      stringIds,
    },
  );

  expect(strings.length).toEqual(data.length);

  for (const [, stringData] of zip(stringIds, data)) {
    // oxlint-disable-next-line no-await-in-loop
    const string = await executeQuery({ db: client }, getStringByValue, {
      value: stringData.text,
      languageId: stringData.languageId,
    });

    expect(string).not.toBeNull();
    expect(string?.value).toEqual(stringData.text);
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
  const pluginManager = PluginManager.get("GLOBAL", "");
  const { client } = await getDbHandle();

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

  const string = await executeQuery({ db: client }, getStringByValue, {
    value: "Duplicate Text",
    languageId: "en",
  });

  expect(string).not.toBeNull();
});
