import {
  createGlossary,
  createUser,
  domainEventBus,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllTerms,
  listMorphologicalTermSuggestions,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import {
  probeGlossaryRecallDependency,
  validateLanguageAnalyzerConfiguration,
  waitForRecallDerivationFresh,
} from "@cat/operations";
import { PluginManager } from "@cat/plugin-core";
import {
  assertSingleNonNullish,
  LanguageAnalysisWildcardSelectionKey,
} from "@cat/shared";
import {
  installTestVectorizationQueue,
  sql,
  setupTestDB,
  TestPluginLoader,
  type TestDB,
} from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { runGraph } from "#/graph/dsl/index.ts";
import { createDefaultGraphRuntime } from "#/graph/index.ts";

import { createTermGraph } from "../create-term.ts";

let cleanup: () => Promise<void>;
let testDb: TestDB;
let pluginManager: PluginManager;
let glossaryId: string;

afterAll(async () => {
  await cleanup?.();
});

beforeAll(async () => {
  const db = await setupTestDB();
  testDb = db;
  cleanup = db.cleanup;

  PluginManager.clear();
  pluginManager = PluginManager.get(
    "GLOBAL",
    "",
    new TestPluginLoader({ includeLanguageAnalyzer: true }),
  );

  await pluginManager.getDiscovery().syncDefinitions(db.client);
  await pluginManager.install(db.client, "mock");
  await pluginManager.install(db.client, "mock-language-analyzer");
  await db.client.transaction(async (tx) => {
    await pluginManager.restore(
      tx,
      // @ts-expect-error no need for hono
      {},
    );
  });
  const languageAnalyzer = assertSingleNonNullish(
    pluginManager.getServices("LANGUAGE_ANALYZER"),
  );
  const languageAnalyzerReference =
    pluginManager.createServiceImplementationReference(languageAnalyzer);
  const validated = await validateLanguageAnalyzerConfiguration(
    languageAnalyzerReference,
    { traceId: "create-term-language-analysis", pluginManager },
  );
  await executeCommand(
    { db: db.client },
    writeValidatedLanguageAnalysisSelection,
    {
      key: LanguageAnalysisWildcardSelectionKey,
      implementation: languageAnalyzerReference,
      configurationFingerprint: validated.fingerprint,
      expectedRevision: 0,
    },
  );

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
      vectorizer:
        pluginManager.createServiceImplementationReference(vectorizer),
      vectorStorage:
        pluginManager.createServiceImplementationReference(vectorStorage),
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
      vectorizer:
        pluginManager.createServiceImplementationReference(vectorizer),
      vectorStorage:
        pluginManager.createServiceImplementationReference(vectorStorage),
    },
    { pluginManager },
  );
  expect(termIds).toEqual([]);
});

test("create-term publishes events after the outer transaction commits", async () => {
  const observer = await testDb.openConcurrentClient();
  const eventVisibility: boolean[] = [];
  const unsubscribe = domainEventBus.subscribe(
    "term:created",
    async (event) => {
      if (event.payload.glossaryId !== glossaryId) return;

      const visibleTerms = await executeQuery(
        { db: observer.client },
        listAllTerms,
        {},
      );
      const visibleTermIds = new Set(
        visibleTerms.map((entry) => entry.term.id),
      );
      eventVisibility.push(
        event.payload.termIds.every((termId) => visibleTermIds.has(termId)),
      );
    },
  );

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  try {
    await runGraph(
      createTermGraph,
      {
        glossaryId,
        data: [
          {
            term: "post-commit event",
            termLanguageId: "en",
            translation: "提交后事件",
            translationLanguageId: "zh-Hans",
            definition: "A term used to verify post-commit event visibility",
          },
        ],
        vectorizer:
          pluginManager.createServiceImplementationReference(vectorizer),
        vectorStorage:
          pluginManager.createServiceImplementationReference(vectorStorage),
      },
      { pluginManager },
    );

    expect(eventVisibility).toEqual([true]);
  } finally {
    unsubscribe();
    await observer.cleanup();
  }
});

test("create-term does not publish events when the outer transaction rolls back", async () => {
  const observedTermIds: number[] = [];
  const unsubscribe = domainEventBus.subscribe("term:created", (event) => {
    if (event.payload.glossaryId === glossaryId) {
      observedTermIds.push(...event.payload.termIds);
    }
  });
  await testDb.client.execute(sql`
    CREATE FUNCTION reject_create_term_commit() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'create term commit rejected';
    END;
    $$ LANGUAGE plpgsql;
    CREATE CONSTRAINT TRIGGER reject_create_term_commit
    AFTER INSERT ON "Term"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION reject_create_term_commit();
  `);

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  try {
    await expect(
      runGraph(
        createTermGraph,
        {
          glossaryId,
          data: [
            {
              term: "rolled-back event",
              termLanguageId: "en",
              translation: "回滚事件",
              translationLanguageId: "zh-Hans",
            },
          ],
          vectorizer:
            pluginManager.createServiceImplementationReference(vectorizer),
          vectorStorage:
            pluginManager.createServiceImplementationReference(vectorStorage),
        },
        { pluginManager },
      ),
    ).rejects.toThrow();
    expect(observedTermIds).toEqual([]);
  } finally {
    unsubscribe();
    await testDb.client.execute(sql`
      DROP TRIGGER reject_create_term_commit ON "Term";
      DROP FUNCTION reject_create_term_commit();
    `);
  }
});

test("create-term publishes morphological recall variants through derivation demand", async () => {
  const { client: drizzle } = await getDbHandle();

  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const created = await runGraph(
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
      vectorizer:
        pluginManager.createServiceImplementationReference(vectorizer),
      vectorStorage:
        pluginManager.createServiceImplementationReference(vectorStorage),
    },
    { pluginManager },
  );
  await waitForRecallDerivationFresh(created.derivations, {
    db: drizzle,
    pluginManager,
  });
  const dependency = await probeGlossaryRecallDependency({
    db: drizzle,
    pluginManager,
    languageId: "en",
    text: "404 error",
  });

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
      requiredDerivationVersion: dependency.requiredDerivationVersion,
    },
  );

  expect(matches.some((match) => match.term === "HTTP 404 error")).toBe(true);
  expect(
    matches[0]?.evidences.some(
      (evidence) => evidence.channel === "morphological",
    ),
  ).toBe(true);
});
