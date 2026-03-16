import { blob, eq, file, language, pluginService } from "@cat/db";
import { getDbHandle } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { firstOrGivenService, readableToString } from "@cat/server-shared";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { Readable } from "stream";
import { afterAll, beforeAll, expect, test } from "vitest";

import { parseFileTask } from "../parse-file";

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

  await drizzle.transaction(async (tx) => {
    await tx.insert(language).values([{ id: "en" }]);

    const { id } = assertSingleNonNullish(
      await tx
        .select({ id: pluginService.id })
        .from(pluginService)
        .where(eq(pluginService.serviceType, "STORAGE_PROVIDER")),
    );

    const { id: blobId } = assertSingleNonNullish(
      await tx
        .insert(blob)
        .values({
          key,
          storageProviderId: id,
        })
        .returning({ id: blob.id }),
    );

    await tx.insert(file).values({
      name: "Test File",
      blobId,
      isActive: true,
    });
  });
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
  const { id: fileId } = assertSingleNonNullish(
    await drizzle.select({ id: file.id }).from(file),
  );

  const { result } = await parseFileTask.run({
    fileId,
    languageId: "en",
  });

  const { elements } = await result();
  expect(elements.length).toEqual(2);
  expect(elements[0]?.text).toEqual("Hello World!");
  expect(elements[1]?.text).toEqual("YKDZ");
  expect(elements[0]?.sortIndex).toEqual(0);
  expect(elements[1]?.sortIndex).toEqual(1);
});
