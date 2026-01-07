import { afterAll, beforeAll, expect, test } from "vitest";
import { getDrizzleDB, glossary, language, user } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
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
