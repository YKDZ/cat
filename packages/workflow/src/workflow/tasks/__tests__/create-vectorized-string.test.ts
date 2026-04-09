import {
  ensureLanguages,
  getStringByValue,
  listVectorizedStringsById,
  executeCommand,
  getDbHandle,
  executeQuery,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish, zip } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/typed-dsl";

import { createVectorizedStringGraph } from "../create-vectorized-string";

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

  createDefaultGraphRuntime(drizzle, pluginManager);
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

  const { stringIds } = await runGraph(createVectorizedStringGraph, {
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });
  const strings = await executeQuery(
    { db: client },
    listVectorizedStringsById,
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
    // Async mode: strings are inserted with PENDING_VECTORIZE status initially
    expect(string?.status).toEqual("PENDING_VECTORIZE");
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

  const { stringIds } = await runGraph(createVectorizedStringGraph, {
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });
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

  const { stringIds: ids1 } = await runGraph(createVectorizedStringGraph, {
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { stringIds: ids2 } = await runGraph(createVectorizedStringGraph, {
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  expect(ids1[0]).toEqual(ids2[0]);

  const string = await executeQuery({ db: client }, getStringByValue, {
    value: "Duplicate Text",
    languageId: "en",
  });

  expect(string).not.toBeNull();
});
