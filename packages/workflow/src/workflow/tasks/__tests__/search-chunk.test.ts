import {
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllChunks,
} from "@cat/domain";
import { processVectorizationBatch } from "@cat/operations";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import {
  installTestVectorizationQueue,
  setupTestDB,
  TestPluginLoader,
} from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/typed-dsl";

import { createVectorizedStringGraph } from "../create-vectorized-string";
import { searchChunkGraph } from "../search-chunk";

const data = [
  { text: "Search chunk text 1", languageId: "en" },
  { text: "Search chunk text 2", languageId: "en" },
  { text: "Search chunk text 3", languageId: "en" },
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

  const pluginManager2 = PluginManager.get("GLOBAL", "");
  const vectorStorage = assertSingleNonNullish(
    pluginManager2.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager2.getServices("TEXT_VECTORIZER"),
  );

  vectorizationQueue = installTestVectorizationQueue();
  createDefaultGraphRuntime(drizzle, pluginManager);

  await runGraph(createVectorizedStringGraph, {
    data,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  await processVectorizationBatch(vectorizationQueue, 10, {
    traceId: "search-chunk-test",
    pluginManager,
  });
});

test("search-chunk should return similar chunks", async () => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );

  const allChunks = await executeQuery({ db: drizzle }, listAllChunks, {});
  const chunkIds = allChunks.map((chunk) => chunk.id);
  const searchRange = chunkIds;

  const { chunks } = await runGraph(searchChunkGraph, {
    minSimilarity: 0,
    maxAmount: 10,
    searchRange,
    queryChunkIds: [chunkIds[0]],
    vectorStorageId: vectorStorage.dbId,
  });

  expect(Array.isArray(chunks)).toBe(true);
  expect(chunks.length).toBeGreaterThan(0);

  for (const chunk of chunks) {
    expect(chunk).toHaveProperty("chunkId");
    expect(chunk).toHaveProperty("similarity");
    expect(typeof chunk.chunkId).toBe("number");
    expect(chunk.similarity).toBeGreaterThanOrEqual(0);
    expect(chunk.similarity).toBeLessThanOrEqual(1);
  }
});

test("search-chunk with empty searchRange should return empty chunks", async () => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );

  const allChunks = await executeQuery({ db: drizzle }, listAllChunks, {});
  const chunkIds = allChunks.map((chunk) => chunk.id);

  const { chunks } = await runGraph(searchChunkGraph, {
    minSimilarity: 0,
    maxAmount: 10,
    searchRange: [],
    queryChunkIds: [chunkIds[0]],
    vectorStorageId: vectorStorage.dbId,
  });
  expect(Array.isArray(chunks)).toBe(true);
  expect(chunks.length).toEqual(0);
});
