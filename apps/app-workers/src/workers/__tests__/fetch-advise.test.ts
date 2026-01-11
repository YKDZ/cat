import { afterAll, beforeAll, expect, test } from "vitest";
import { getDrizzleDB, glossary, language, user } from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { fetchAdviseWorkflow } from "../fetch-advise.ts";

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

test("worker should fetch advise", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { id: glossaryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: glossary.id,
      })
      .from(glossary),
  );

  const { result } = await fetchAdviseWorkflow.run({
    text: "Test Text For Advise",
    sourceLanguageId: "en",
    translationLanguageId: "zh-Hans",
    glossaryIds: [glossaryId],
  });

  const { suggestions } = await result();

  expect(suggestions.length).toBeGreaterThan(0);
});
