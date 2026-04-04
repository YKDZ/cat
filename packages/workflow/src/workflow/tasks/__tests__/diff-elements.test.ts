import {
  createChunkSet,
  createElements,
  createProject,
  createRootDocument,
  createTranslatableStrings,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllElements,
  listElementIdsByDocument,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/typed-dsl";

import { diffElementsGraph } from "../diff-elements";

const oldElements = [
  { text: "Test 1", languageId: "en", meta: { key: 1 }, sortIndex: 1 },
  { text: "Test 2", languageId: "en", meta: { key: 2 }, sortIndex: 2 },
  { text: "Test 3", languageId: "en", meta: { key: 3 }, sortIndex: 3 },
];

const newElements = [
  { text: "Test 1", languageId: "en", meta: { key: 1 }, sortIndex: 1 },
  {
    text: "Test Changed 2",
    languageId: "en",
    meta: { key: 2 },
    sortIndex: 3,
  },
  { text: "Test 3", languageId: "en", meta: { key: 3 }, sortIndex: 2 },
  { text: "Test New 4", languageId: "en", meta: { key: 4 }, sortIndex: 4 },
];

let cleanup: () => Promise<void>;
let documentId: string;

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
    languageIds: ["en", "zh_Hans"],
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

  const document = await executeCommand({ db: drizzle }, createRootDocument, {
    name: "Test Document",
    projectId: project.id,
    creatorId: user.id,
  });
  documentId = document.id;

  // Create old elements manually for diff testing
  for (const element of oldElements) {
    // oxlint-disable-next-line no-await-in-loop
    const chunkSet = await executeCommand({ db: drizzle }, createChunkSet, {});
    // oxlint-disable-next-line no-await-in-loop
    const stringIds = await executeCommand(
      { db: drizzle },
      createTranslatableStrings,
      {
        chunkSetIds: [chunkSet.id],
        data: [{ text: element.text, languageId: element.languageId }],
      },
    );
    // oxlint-disable-next-line no-await-in-loop
    await executeCommand({ db: drizzle }, createElements, {
      data: [
        {
          documentId,
          stringId: stringIds[0],
          meta: element.meta,
          sortIndex: element.sortIndex,
        },
      ],
    });
  }

  createDefaultGraphRuntime(drizzle, pluginManager);
});

test("worker should diff elements", async () => {
  const pluginManager = PluginManager.get("GLOBAL", "");
  const { client: drizzle } = await getDbHandle();

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const oldElementIds = await executeQuery(
    { db: drizzle },
    listElementIdsByDocument,
    {
      documentId,
    },
  );

  const { addedElementIds, removedElementIds } = await runGraph(
    diffElementsGraph,
    {
      documentId,
      oldElementIds,
      elementData: newElements,
      vectorizerId: vectorizer.dbId,
      vectorStorageId: vectorStorage.dbId,
    },
  );
  expect(addedElementIds.length).toEqual(1);
  expect(removedElementIds.length).toEqual(0);

  const allElements = await executeQuery({ db: drizzle }, listAllElements, {});

  expect(allElements.length).toEqual(4);
  expect(
    allElements.map((item) => item.sortIndex ?? 0).sort((a, b) => a - b),
  ).toEqual([1, 2, 3, 4]);

  const changedElement = allElements.find((item) => {
    const meta = item.meta;
    return (
      typeof meta === "object" &&
      meta !== null &&
      !Array.isArray(meta) &&
      Reflect.get(meta, "key") === 2
    );
  });

  expect(changedElement).toBeDefined();
  expect(changedElement?.sortIndex).toEqual(3);
});
