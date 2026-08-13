import {
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllChunks,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { runGraph } from "#/graph/dsl/index.ts";
import {
  cleanupTestGraphFixture,
  createTestGraphRuntime,
  type TestGraphRuntimeFixture,
} from "#/graph/testing/test-graph-runtime.ts";

import { vectorizeGraph } from "../vectorize.ts";

const data = [
  { text: "Vectorize text 1", languageId: "en" },
  { text: "Vectorize text 2", languageId: "en" },
];

let cleanup: (() => Promise<void>) | undefined;
let runtimeFixture: TestGraphRuntimeFixture | undefined;

afterAll(async () => {
  await cleanupTestGraphFixture(
    runtimeFixture,
    cleanup ? { cleanup } : undefined,
  );
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

  runtimeFixture = createTestGraphRuntime(db, pluginManager);
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

  const { chunkSetIds } = await runGraph(vectorizeGraph, {
    data,
    vectorizer: pluginManager.createServiceImplementationReference(vectorizer),
    vectorStorage:
      pluginManager.createServiceImplementationReference(vectorStorage),
  });

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

  const { chunkSetIds } = await runGraph(vectorizeGraph, {
    data: [],
    vectorizer: pluginManager.createServiceImplementationReference(vectorizer),
    vectorStorage:
      pluginManager.createServiceImplementationReference(vectorStorage),
  });
  expect(chunkSetIds).toEqual([]);
});
