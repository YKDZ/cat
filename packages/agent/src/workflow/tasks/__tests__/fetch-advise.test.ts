import {
  createGlossary,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllGlossaries,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { fetchAdviseWorkflow } from "../fetch-advise";

let cleanup: () => Promise<void>;
let pluginManager: PluginManager;

afterAll(async () => {
  await cleanup?.();
});

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;

  PluginManager.clear();
  pluginManager = PluginManager.get(
    "PROJECT",
    "fetch-advise-test",
    new TestPluginLoader(),
  );

  await pluginManager.getDiscovery().syncDefinitions(db.client);
  await pluginManager.install(db.client, "mock");
  await db.client.transaction(async (tx) => {
    await pluginManager.restore(
      tx,
      // @ts-expect-error no need for hono
      {},
    );
  });

  await executeCommand({ db: db.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const user = await executeCommand({ db: db.client }, createUser, {
    email: "admin@encmys.cn",
    name: "YKDZ",
  });

  await executeCommand({ db: db.client }, createGlossary, {
    name: "Test",
    creatorId: user.id,
  });
});

test("worker should fetch advise", async () => {
  const { client: drizzle } = await getDbHandle();

  const glossaries = await executeQuery({ db: drizzle }, listAllGlossaries, {});
  const glossaryId = glossaries[0].id;

  const { result } = await fetchAdviseWorkflow.run(
    {
      text: "Test Text For Advise",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      glossaryIds: [glossaryId],
    },
    {
      pluginManager,
    },
  );

  const { suggestions } = await result();
  expect(suggestions.length).toBeGreaterThan(0);
});
