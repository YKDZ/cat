import {
  createBlob,
  createFile,
  ensureLanguages,
  getPluginServiceByType,
  listAllFiles,
  executeCommand,
  executeQuery,
  getDbHandle,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { firstOrGivenService, readableToString } from "@cat/server-shared";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { Readable } from "stream";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/typed-dsl";

import { parseFileGraph } from "../parse-file";

const key = "/file/key";

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
    languageIds: ["en"],
  });

  const storageService = await executeQuery(
    { db: drizzle },
    getPluginServiceByType,
    {
      serviceType: "STORAGE_PROVIDER",
    },
  );

  if (!storageService) {
    throw new Error("Storage provider not found");
  }

  const blobResult = await executeCommand({ db: drizzle }, createBlob, {
    key,
    storageProviderId: storageService.id,
  });

  await executeCommand({ db: drizzle }, createFile, {
    name: "Test File",
    blobId: blobResult.id,
    isActive: true,
  });

  createDefaultGraphRuntime(drizzle, pluginManager);
});

test("storage provider should store and retrieve data correctly", async () => {
  const pluginManager = PluginManager.get("GLOBAL", "");
  const storage = firstOrGivenService(pluginManager, "STORAGE_PROVIDER");
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
  const fileId = files[0].id;

  const { elements } = await runGraph(parseFileGraph, {
    fileId,
    languageId: "en",
  });
  expect(elements.length).toEqual(2);
  expect(elements[0]?.text).toEqual("Hello World!");
  expect(elements[1]?.text).toEqual("YKDZ");
  expect(elements[0]?.sortIndex).toEqual(0);
  expect(elements[1]?.sortIndex).toEqual(1);
});
