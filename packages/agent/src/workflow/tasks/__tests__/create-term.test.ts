import {
  createGlossary,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllTerms,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createTermTask } from "../create-term";

let cleanup: () => Promise<void>;
let pluginManager: PluginManager;
let glossaryId: string;

afterAll(async () => {
  await cleanup?.();
});

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;

  PluginManager.clear();
  pluginManager = PluginManager.get(
    "PROJECT",
    "create-term-test",
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
    // mul = ISO 639-2 multilingual, used by revectorizeConceptOp for concept definitions
    languageIds: ["en", "zh-Hans", "mul"],
  });

  const user = await executeCommand({ db: db.client }, createUser, {
    email: "admin@encmys.cn",
    name: "YKDZ",
  });

  const glossary = await executeCommand({ db: db.client }, createGlossary, {
    name: "Test Glossary",
    creatorId: user.id,
  });
  glossaryId = glossary.id;
});

test("create-term should insert terms to db", async () => {
  const { client: drizzle } = await getDbHandle();

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const termData = [
    {
      term: "block",
      termLanguageId: "en",
      translation: "方块",
      translationLanguageId: "zh-Hans",
      definition: "A solid cube in Minecraft",
    },
    {
      term: "diamond",
      termLanguageId: "en",
      translation: "钻石",
      translationLanguageId: "zh-Hans",
    },
  ];

  const { result } = await createTermTask.run(
    {
      glossaryId,
      data: termData,
      vectorizerId: vectorizer.dbId,
      vectorStorageId: vectorStorage.dbId,
    },
    { pluginManager },
  );

  const { termIds } = await result();

  // Each TermData creates 2 term records (source term + translation term)
  expect(termIds.length).toEqual(termData.length * 2);

  const terms = await executeQuery({ db: drizzle }, listAllTerms, {});
  expect(terms.length).toBeGreaterThanOrEqual(termData.length);
});

test("create-term with empty data should return empty termIds", async () => {
  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const { result } = await createTermTask.run(
    {
      glossaryId,
      data: [],
      vectorizerId: vectorizer.dbId,
      vectorStorageId: vectorStorage.dbId,
    },
    { pluginManager },
  );

  const { termIds } = await result();
  expect(termIds).toEqual([]);
});
