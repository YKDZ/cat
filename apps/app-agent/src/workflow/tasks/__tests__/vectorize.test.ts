import {
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllChunks,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { vectorizeToChunkSetTask } from "../vectorize";

const data = [
  { text: "Vectorize text 1", languageId: "en" },
  { text: "Vectorize text 2", languageId: "en" },
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

  await executeCommand({ db: drizzle }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
});

test("vectorize should create chunk sets and store embeddings", async () => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { result } = await vectorizeToChunkSetTask.run({
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { chunkSetIds } = await result();

  expect(chunkSetIds.length).toEqual(data.length);

  const chunks = await executeQuery({ db: drizzle }, listAllChunks, {});
  expect(chunks.length).toBeGreaterThanOrEqual(data.length);
});

test("vectorize with empty input should return empty chunkSetIds", async () => {
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { result } = await vectorizeToChunkSetTask.run({
    data: [],
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  const { chunkSetIds } = await result();
  expect(chunkSetIds).toEqual([]);
});
