import { afterAll, beforeAll, expect, test } from "vitest";
import {
  eq,
  getColumns,
  getDrizzleDB,
  language,
  translatableString,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { createTranslatableStringTask } from "@/workers/create-translatable-string";
import { zip } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";

let cleanup: () => Promise<void>;

afterAll(async () => {
  await cleanup?.();
});

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;
  const drizzle = db.client;

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
  await drizzle.insert(language).values([
    {
      id: "en",
    },
    {
      id: "zh-Hans",
    },
  ]);
});

test("worker should insert strings to db", async () => {
  const { client: drizzle } = await getDrizzleDB();

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

  const { result } = await createTranslatableStringTask.run({
    data,
  });

  const { stringIds } = await result();

  const strings = await drizzle
    .select(getColumns(translatableString))
    .from(translatableString);

  expect(strings.length).toEqual(data.length);

  // 测试返回 stringId 的顺序是否与数据相同

  for (const [stringId, stringData] of zip(stringIds, data)) {
    // oxlint-disable-next-line no-await-in-loop
    const strings = await drizzle
      .select({ value: translatableString.value })
      .from(translatableString)
      .where(eq(translatableString.id, stringId));

    expect(strings.length).toEqual(1);

    expect(strings[0].value).toEqual(stringData.text);
  }
});

test("empty input should return empty array", async () => {
  const data: { text: string; languageId: string }[] = [];

  const { stringIds } = await createTranslatableStringTask.handler(
    {
      data,
    },
    { traceId: "test" },
  );

  expect(stringIds.length).toEqual(0);
});

test("worker should reuse existing strings", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const data = [
    {
      text: "Duplicate Text",
      languageId: "en",
    },
  ];

  // First run
  const { result: result1 } = await createTranslatableStringTask.run({ data });
  const { stringIds: ids1 } = await result1();

  // Second run
  const { result: result2 } = await createTranslatableStringTask.run({ data });
  const { stringIds: ids2 } = await result2();

  expect(ids1[0]).toEqual(ids2[0]);

  // Verify count in DB
  const strings = await drizzle
    .select()
    .from(translatableString)
    .where(eq(translatableString.value, "Duplicate Text"));

  expect(strings).toHaveLength(1);
});
