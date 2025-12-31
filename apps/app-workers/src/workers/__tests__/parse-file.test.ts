import { beforeAll, expect, test } from "vitest";
import {
  blob,
  eq,
  file,
  getDrizzleDB,
  language,
  plugin,
  pluginService,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import {
  firstOrGivenService,
  readableToString,
} from "@cat/app-server-shared/utils";
import { parseFileTask } from "@/workers/parse-file.ts";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { Readable } from "stream";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";

const key = "/file/key";

beforeAll(async () => {
  const { client: drizzle } = await setupTestDB();

  const pluginRegistry = PluginRegistry.get(
    "GLOBAL",
    "",
    new TestPluginLoader(),
  );

  await pluginRegistry.importAvailablePlugins(drizzle);
  await pluginRegistry.installPlugin(drizzle, "mock");
  // @ts-expect-error no need for hono here
  await pluginRegistry.enableAllPlugins(drizzle, {});

  // Seed
  await drizzle.transaction(async (tx) => {
    await tx.insert(language).values([{ id: "en" }]);

    const { id } = assertSingleNonNullish(
      await tx
        .select({
          id: pluginService.id,
        })
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
        .returning({
          id: blob.id,
        }),
    );

    await tx.insert(file).values({
      name: "Test File",
      blobId,
    });
  });
});

test("plugin should exists in db", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const plugs = await drizzle
    .select({ id: plugin.id })
    .from(plugin)
    .where(eq(plugin.id, "mock"));

  expect(plugs.length).toEqual(1);
});

test("file should exists in db", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const files = await drizzle.select({ id: file.id }).from(file);

  expect(files.length).toEqual(1);
});

test("storage provider should exists", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  const provider = await firstOrGivenService(
    drizzle,
    pluginRegistry,
    "STORAGE_PROVIDER",
    0,
  );
  const handler = await firstOrGivenService(
    drizzle,
    pluginRegistry,
    "TRANSLATABLE_FILE_HANDLER",
    0,
  );

  expect(provider).toBeDefined();
  expect(handler).toBeDefined();
});

test("storage provider should store and retrieve data correctly", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  const { service: provider } = (await firstOrGivenService(
    drizzle,
    pluginRegistry,
    "STORAGE_PROVIDER",
    0,
  ))!;

  const text = "Hello World!\nYKDZ";

  await provider.putStream({ key, stream: Readable.from(text) });

  expect(await readableToString(await provider.getStream({ key }))).toEqual(
    text,
  );
});

test("worker should parse elements from file", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { id: fileId } = assertSingleNonNullish(
    await drizzle.select({ id: file.id }).from(file),
  );

  const { result } = await parseFileTask.run({
    fileId,
    languageId: "en",
  });

  const { elements } = await result();

  expect(elements.length).toEqual(2);
  expect(elements[0].value).toEqual("Hello World!");
  expect(elements[1].value).toEqual("YKDZ");
  // handler 没有给出 sortIndex 的情况下能否自动补齐
  // handler 没有给出 sortIndex 的情况下能否自动补齐
  expect(elements[0].sortIndex).toEqual(0);
  expect(elements[1].sortIndex).toEqual(1);
});
