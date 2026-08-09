import { Readable } from "stream";

import {
  createContentNodeUnderParent,
  createBlob,
  createFile,
  createProject,
  createRootContentNode,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
  listAllFiles,
  executeCommand,
  executeQuery,
  getDbHandle,
  listProjectContentNodes,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import {
  readableToString,
  selectFirstServiceImplementation,
} from "@cat/server-shared";
import { assertSingleNonNullish } from "@cat/shared";
import {
  installTestVectorizationQueue,
  setupTestDB,
  TestPluginLoader,
} from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { runGraph } from "#/graph/dsl/index.ts";
import {
  cleanupTestGraphFixture,
  createTestGraphRuntime,
  type TestGraphRuntimeFixture,
} from "#/graph/testing/test-graph-runtime.ts";

import { parseFileGraph } from "../parse-file.ts";
import { upsertContentNodeGraph } from "../upsert-content-node-from-file.ts";

const key = "/file/key";

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
    languageIds: ["en"],
  });

  const storageService = selectFirstServiceImplementation(
    pluginManager,
    "STORAGE_PROVIDER",
  );
  if (!storageService) {
    throw new Error("Storage provider not found");
  }

  const blobResult = await executeCommand({ db: drizzle }, createBlob, {
    key,
    storageProvider: storageService.reference,
  });

  await executeCommand({ db: drizzle }, createFile, {
    name: "Test File",
    blobId: blobResult.id,
    isActive: true,
  });

  installTestVectorizationQueue();
  runtimeFixture = createTestGraphRuntime(db, pluginManager);
});

test("storage provider should store and retrieve data correctly", async () => {
  const pluginManager = PluginManager.get("GLOBAL", "");
  const storage = selectFirstServiceImplementation(
    pluginManager,
    "STORAGE_PROVIDER",
  );
  if (!storage) {
    throw new Error("Storage provider not found");
  }

  const text = "Hello World!\nYKDZ";
  await storage.service.putStream({ key, stream: Readable.from(text) });

  expect(
    await readableToString(await storage.service.getStream({ key })),
  ).toEqual(text);
});

test("worker should parse elements from file", async () => {
  const { client: drizzle } = await getDbHandle();

  const files = await executeQuery({ db: drizzle }, listAllFiles, {});
  const fileId = assertSingleNonNullish(files).id;

  const { payload } = await runGraph(parseFileGraph, {
    projectId: "00000000-0000-4000-8000-000000000001",
    fileId,
    languageId: "en",
  });
  expect(payload.elements.length).toEqual(2);
  expect(payload.elements[0]?.text).toEqual("Hello World!");
  expect(payload.elements[1]?.text).toEqual("YKDZ");
});

test("upsert graph should reuse existing file content node metadata", async () => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");
  const storageProvider = selectFirstServiceImplementation(
    pluginManager,
    "STORAGE_PROVIDER",
  );
  const fileImporter = pluginManager.getServices("FILE_IMPORTER")[0];
  const vectorizer = pluginManager.getServices("TEXT_VECTORIZER")[0];
  const vectorStorage = pluginManager.getServices("VECTOR_STORAGE")[0];

  if (!storageProvider || !fileImporter || !vectorizer || !vectorStorage) {
    throw new Error("Required file services not found");
  }

  await storageProvider.service.putStream({
    key,
    stream: Readable.from("Hello World!\nYKDZ"),
  });

  const user = await executeCommand({ db: drizzle }, createUser, {
    email: "upsert-file@test.com",
    name: "Upsert File User",
  });

  const project = await executeCommand({ db: drizzle }, createProject, {
    name: "Upsert File Project",
    description: null,
    creatorId: user.id,
  });

  await executeCommand({ db: drizzle }, ensureCoreRelationTypes, {});

  const rootNode = await executeCommand(
    { db: drizzle },
    createRootContentNode,
    {
      projectId: project.id,
      creatorId: user.id,
    },
  );

  const files = await executeQuery({ db: drizzle }, listAllFiles, {});
  const fileId = files[0]?.id;

  if (!fileId) {
    throw new Error("Expected seeded file to exist");
  }

  const existingNode = await executeCommand(
    { db: drizzle },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId: user.id,
      parentContentNodeId: rootNode.id,
      kind: "FILE",
      displayLabel: "Test File",
      importerId: fileImporter.id,
      sourceRootRef: `project:${project.id}`,
      stableSourceNodeRef: "file-node:test-file",
      exportRole: "FILE",
      boundaryType: "FILE",
      fileHandler:
        pluginManager.createServiceImplementationReference(fileImporter),
      fileId,
      localOrder: 0,
    },
  );

  await runGraph(upsertContentNodeGraph, {
    projectId: project.id,
    contentNodeId: existingNode.id,
    fileId,
    languageId: "en",
    vectorizer: pluginManager.createServiceImplementationReference(vectorizer),
    vectorStorage:
      pluginManager.createServiceImplementationReference(vectorStorage),
  });

  const contentNodes = await executeQuery(
    { db: drizzle },
    listProjectContentNodes,
    {
      projectId: project.id,
    },
  );
  const matchingNodes = contentNodes.filter(
    (node) => node.displayLabel === "Test File",
  );

  expect(matchingNodes).toHaveLength(1);
  expect(matchingNodes[0]).toMatchObject({
    id: existingNode.id,
    exportRole: "FILE",
    boundaryType: "FILE",
    fileId,
    fileHandler:
      pluginManager.createServiceImplementationReference(fileImporter),
  });
});
