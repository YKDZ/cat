import { afterAll, beforeAll, expect, test } from "vitest";
import {
  getColumns,
  getDrizzleDB,
  glossary,
  language,
  term,
  termEntry,
  user,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { searchTermTask } from "../search-term.ts";
import { createTermTask } from "../create-term.ts";

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
      tx, // @ts-expect-error no need for hono
      {},
    );
  });

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

    const { id: userId } = assertSingleNonNullish(
      await tx
        .insert(user)
        .values({
          email: "admin@encmys.cn",
          name: "YKDZ",
        })
        .returning({ id: user.id }),
    );

    await tx.insert(glossary).values({
      name: "Test",
      creatorId: userId,
    });
  });
});

test("create-term should insert and return term", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { id: glossaryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: glossary.id,
      })
      .from(glossary)
      .limit(1),
  );

  const data = [
    {
      subject: "Minecraft block",
      term: "dirt",
      termLanguageId: "en",
      translation: "泥土",
      translationLanguageId: "zh-Hans",
    },
    {
      subject: "Minecraft block",
      term: "diamond block",
      termLanguageId: "en",
      translation: "钻石块",
      translationLanguageId: "zh-Hans",
    },
  ];

  const { result } = await createTermTask.run({ glossaryId, data });

  const { termIds } = await result();

  expect(termIds.length).toBe(termIds.length);

  const terms = await drizzle.select(getColumns(term)).from(term);
  const termEntries = await drizzle
    .select(getColumns(termEntry))
    .from(termEntry);

  expect(terms.length).toBe(data.length * 2);
  expect(termEntries.length).toBe(
    new Set(data.map((item) => item.subject)).size,
  );
});

test("worker should serch term", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { id: glossaryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: glossary.id,
      })
      .from(glossary),
  );

  const { result } = await searchTermTask.run({
    glossaryIds: [glossaryId],
    text: "Test [Term]",
    sourceLanguageId: "en",
    translationLanguageId: "zh-Hans",
  });

  const { terms } = await result();

  expect(terms.length).toBeGreaterThan(0);
});
