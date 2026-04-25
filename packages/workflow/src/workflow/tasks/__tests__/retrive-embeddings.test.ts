import {
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllChunks,
  listAllVectorizedStrings,
} from "@cat/domain";
import { processVectorizationBatch } from "@cat/operations";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared";
import {
  installTestVectorizationQueue,
  setupTestDB,
  TestPluginLoader,
} from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/dsl";

import { createVectorizedStringGraph } from "../create-vectorized-string";
import { retriveEmbeddingsGraph } from "../retrive-embeddings";

const data = [
  { text: "Text 1", languageId: "en" },
  { text: "Text 2", languageId: "en" },
  { text: "Text 3", languageId: "en" },
];

let cleanup: () => Promise<void>;
let pluginManager: PluginManager;
let vectorizationQueue: ReturnType<typeof installTestVectorizationQueue>;

afterAll(async () => {
  await cleanup?.();
});

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;
  const drizzle = db.client;

  pluginManager = PluginManager.get("GLOBAL", "", new TestPluginLoader());

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

  vectorizationQueue = installTestVectorizationQueue();
  createDefaultGraphRuntime(drizzle, pluginManager);
});

test("create-translatable-string should insert chunks to db", async () => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  await runGraph(createVectorizedStringGraph, {
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  await processVectorizationBatch(vectorizationQueue, 10, {
    traceId: "retrieve-embeddings-test",
    pluginManager,
  });

  const strings = await executeQuery(
    { db: drizzle },
    listAllVectorizedStrings,
    {},
  );

  expect(strings.length).toEqual(data.length);
});

test("worker should retrive stored embeddings", async () => {
  const { client: drizzle } = await getDbHandle();

  const chunkIds = await executeQuery({ db: drizzle }, listAllChunks, {}).then(
    (chunks) => chunks.map((chunk) => chunk.id),
  );

  const { embeddings } = await runGraph(retriveEmbeddingsGraph, { chunkIds });

  expect(embeddings.length).toEqual(data.length);
});
