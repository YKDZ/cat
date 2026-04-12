import {
  createGlossary,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllTerms,
  listMorphologicalTermSuggestions,
} from "@cat/domain";
import { registerDomainEventHandlers } from "@cat/operations";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import {
  installTestVectorizationQueue,
  setupTestDB,
  TestPluginLoader,
} from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/typed-dsl";

import { createTermGraph } from "../create-term";

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
    new TestPluginLoader({ includeNlpSegmenter: true }),
  );

  await pluginManager.getDiscovery().syncDefinitions(db.client);
  await pluginManager.install(db.client, "mock");
  await pluginManager.install(db.client, "mock-nlp-segmenter");
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

  installTestVectorizationQueue();

  const user = await executeCommand({ db: db.client }, createUser, {
    email: "admin@encmys.cn",
    name: "YKDZ",
  });

  const glossary = await executeCommand({ db: db.client }, createGlossary, {
    name: "Test Glossary",
    creatorId: user.id,
  });
  glossaryId = glossary.id;

  createDefaultGraphRuntime(db.client, pluginManager);
  registerDomainEventHandlers(db.client, { pluginManager });
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

  const { termIds } = await runGraph(
    createTermGraph,
    {
      glossaryId,
      data: termData,
      vectorizerId: vectorizer.dbId,
      vectorStorageId: vectorStorage.dbId,
    },
    { pluginManager },
  );

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

  const { termIds } = await runGraph(
    createTermGraph,
    {
      glossaryId,
      data: [],
      vectorizerId: vectorizer.dbId,
      vectorStorageId: vectorStorage.dbId,
    },
    { pluginManager },
  );
  expect(termIds).toEqual([]);
});

test("create-term rebuilds morphological recall variants via domain events", async () => {
  const { client: drizzle } = await getDbHandle();

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  await runGraph(
    createTermGraph,
    {
      glossaryId,
      data: [
        {
          term: "HTTP 404 error",
          termLanguageId: "en",
          translation: "HTTP 404 错误",
          translationLanguageId: "zh-Hans",
          definition: "A structured HTTP error term",
        },
      ],
      vectorizerId: vectorizer.dbId,
      vectorStorageId: vectorStorage.dbId,
    },
    { pluginManager },
  );

  const matches = await executeQuery(
    { db: drizzle },
    listMorphologicalTermSuggestions,
    {
      glossaryIds: [glossaryId],
      normalizedText: "404 error",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      minSimilarity: 0.99,
      maxAmount: 5,
    },
  );

  expect(matches.some((match) => match.term === "HTTP 404 error")).toBe(true);
  expect(
    matches[0]?.evidences.some(
      (evidence) => evidence.channel === "morphological",
    ),
  ).toBe(true);
});
