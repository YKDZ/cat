import {
  createProject,
  createRootContentNode,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllElements,
} from "@cat/domain";
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

import { createElementGraph } from "../create-element";

let cleanup: () => Promise<void>;
let contentNodeId: string;
let projectId: string;

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

  const user = await executeCommand({ db: drizzle }, createUser, {
    email: "admin@encmys.cn",
    name: "YKDZ",
  });

  const project = await executeCommand({ db: drizzle }, createProject, {
    name: "Test Project",
    description: null,
    creatorId: user.id,
  });
  projectId = project.id;

  const contentNode = await executeCommand(
    { db: drizzle },
    createRootContentNode,
    {
      projectId: project.id,
      creatorId: user.id,
    },
  );
  contentNodeId = contentNode.id;

  installTestVectorizationQueue();
  createDefaultGraphRuntime(drizzle, pluginManager);
});

test("create-element should insert elements to db", async () => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const elementData = [
    {
      text: "Element text 1",
      languageId: "en",
      projectId,
      primaryContentNodeId: contentNodeId,
      importerId: "test",
      sourceRootRef: "root:test",
      sourceNodeRef: "src:test",
      stableSourceRef: "stable:test:1",
      localOrder: 1,
    },
    {
      text: "Element text 2",
      languageId: "en",
      projectId,
      primaryContentNodeId: contentNodeId,
      importerId: "test",
      sourceRootRef: "root:test",
      sourceNodeRef: "src:test",
      stableSourceRef: "stable:test:2",
      localOrder: 2,
    },
    {
      text: "Element text 3",
      languageId: "en",
      projectId,
      primaryContentNodeId: contentNodeId,
      importerId: "test",
      sourceRootRef: "root:test",
      sourceNodeRef: "src:test",
      stableSourceRef: "stable:test:3",
      localOrder: 3,
    },
  ];

  const { elementIds } = await runGraph(createElementGraph, {
    data: elementData,
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });

  expect(elementIds.length).toEqual(elementData.length);

  const elements = await executeQuery({ db: drizzle }, listAllElements, {});
  expect(elements.length).toBeGreaterThanOrEqual(elementData.length);
});

test("create-element with empty data should return empty elementIds", async () => {
  const pluginManager = PluginManager.get("GLOBAL", "");

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { elementIds } = await runGraph(createElementGraph, {
    data: [],
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
  });
  expect(elementIds).toEqual([]);
});
