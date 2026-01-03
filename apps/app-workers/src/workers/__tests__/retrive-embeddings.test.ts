import { beforeAll, expect, test } from "vitest";
import {
  chunk,
  getColumns,
  getDrizzleDB,
  language,
  translatableString,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { retriveEmbeddingsTask } from "../retrive-embeddings.ts";
import { createTranslatableStringTask } from "../create-translatable-string.ts";

const data = [
  {
    text: "Text 1",
    languageId: "en",
  },
  {
    text: "Text 2",
    languageId: "en",
  },
  {
    text: "Text 3",
    languageId: "en",
  },
];

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
    await tx.insert(language).values([
      {
        id: "en",
      },
      {
        id: "zh-Hans",
      },
    ]);
  });
});

test("create-translatable-string should insert chunks to db", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { result } = await createTranslatableStringTask.run({
    data,
  });

  await result();

  const strings = await drizzle
    .select(getColumns(translatableString))
    .from(translatableString);

  expect(strings.length).toEqual(data.length);
});

test("worker should retrive stored embeddings", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const chunkIds = (
    await drizzle
      .select({
        id: chunk.id,
      })
      .from(chunk)
  ).map(({ id }) => id);

  const { result } = await retriveEmbeddingsTask.run({ chunkIds });

  const { embeddings } = await result();

  expect(embeddings.length).toEqual(data.length);
});
