import {
  createGlossary,
  createGlossaryTerms,
  createMemory,
  createMemoryItems,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getRecallDerivationStates,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import {
  assertSingleNonNullish,
  LanguageAnalysisWildcardSelectionKey,
  MemoryRecallVariantSchema,
  RecallDerivationReferenceSchema,
  TermRecallVariantSchema,
} from "@cat/shared";
import {
  memoryRecallVariant,
  setupTestDB,
  termRecallVariant,
  TestPluginLoader,
  type TestDB,
  vectorizedString,
} from "@cat/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectTermRecallOp,
  getTermRecallCandidates,
} from "./collect-term-recall.ts";
import { validateLanguageAnalyzerConfiguration } from "./language-analysis-requirement.ts";
import {
  startRecallDerivationWorker,
  waitForRecallDerivationFresh,
} from "./memory-recall-derivation.ts";

describe("Glossary recall worker integration", () => {
  let db: TestDB;
  let pluginManager: PluginManager;
  let creatorId: string;
  let glossaryId: string;

  beforeEach(async () => {
    db = await setupTestDB();
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
      await pluginManager.restore(tx);
    });
    const analyzer = pluginManager.getServices("LANGUAGE_ANALYZER")[0]!;
    const reference =
      pluginManager.createServiceImplementationReference(analyzer);
    const validated = await validateLanguageAnalyzerConfiguration(reference, {
      traceId: "glossary-recall-selection",
      pluginManager,
    });
    await executeCommand(
      { db: db.client },
      writeValidatedLanguageAnalysisSelection,
      {
        key: LanguageAnalysisWildcardSelectionKey,
        implementation: reference,
        configurationFingerprint: validated.fingerprint,
        expectedRevision: 0,
      },
    );
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `glossary-worker-${crypto.randomUUID()}@example.com`,
      name: "Glossary worker owner",
    });
    creatorId = user.id;
    const glossary = await executeCommand({ db: db.client }, createGlossary, {
      creatorId,
      name: "Worker glossary",
    });
    glossaryId = glossary.id;
  });

  afterEach(async () => {
    PluginManager.clear();
    await db?.cleanup();
  });

  it("drains real Memory and Glossary batches through one worker without cross-writing", async () => {
    const glossaryCreated = await executeCommand(
      { db: db.client },
      createGlossaryTerms,
      {
        glossaryId,
        creatorId,
        data: [
          {
            term: "Running tests",
            termLanguageId: "en",
            translation: "运行测试",
            translationLanguageId: "zh-Hans",
            definition: "Execute automated checks",
          },
          {
            term: "Stable pipeline",
            termLanguageId: "en",
            translation: "稳定管线",
            translationLanguageId: "zh-Hans",
            definition: "A deterministic processing pipeline",
          },
        ],
      },
    );
    const strings = await db.client
      .insert(vectorizedString)
      .values([
        { value: "Build 42 completed", languageId: "en" },
        { value: "构建 42 已完成", languageId: "zh-Hans" },
      ])
      .returning({
        id: vectorizedString.id,
        languageId: vectorizedString.languageId,
      });
    const source = assertSingleNonNullish(
      strings.filter((entry) => entry.languageId === "en"),
    );
    const translation = assertSingleNonNullish(
      strings.filter((entry) => entry.languageId === "zh-Hans"),
    );
    const memory = await executeCommand({ db: db.client }, createMemory, {
      creatorId,
      name: "Worker memory",
    });
    const memoryCreated = await executeCommand(
      { db: db.client },
      createMemoryItems,
      {
        memoryId: memory.id,
        items: [
          {
            creatorId,
            translationId: null,
            sourceStringId: source.id,
            translationStringId: translation.id,
          },
        ],
      },
    );
    const references = RecallDerivationReferenceSchema.array().parse([
      ...memoryCreated.derivations,
      ...glossaryCreated.derivations,
    ]);
    expect(memoryCreated.derivations).toHaveLength(2);
    expect(glossaryCreated.derivations).toHaveLength(4);
    expect(references).toHaveLength(6);
    expect(
      new Set(
        references.map(
          (reference) =>
            `${reference.targetKind}:${reference.targetId}:${reference.languageId}`,
        ),
      ).size,
    ).toBe(references.length);

    const worker = await startRecallDerivationWorker({
      db: db.client,
      pluginManager,
      pollIntervalMs: 10,
      dependencyProbeIntervalMs: 60_000,
    });
    try {
      await waitForRecallDerivationFresh(references, {
        db: db.client,
        pluginManager,
        timeoutMs: 30_000,
      });
    } finally {
      await worker.stop();
    }

    const states = await executeQuery(
      { db: db.client },
      getRecallDerivationStates,
      { references },
    );
    expect(states).toHaveLength(references.length);
    expect(states.every((state) => state.status === "FRESH")).toBe(true);
    expect(new Set(states.map((state) => state.targetKind))).toEqual(
      new Set(["MEMORY_ITEM", "TERM_CONCEPT"]),
    );
    const memoryVariants = MemoryRecallVariantSchema.array().parse(
      await db.client.select().from(memoryRecallVariant),
    );
    const termVariants = TermRecallVariantSchema.array().parse(
      await db.client.select().from(termRecallVariant),
    );
    expect(memoryVariants.length).toBeGreaterThan(0);
    expect(termVariants.length).toBeGreaterThan(0);

    const keywordRecall = await collectTermRecallOp(
      {
        glossaryIds: [glossaryId],
        text: "running tests status",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        channels: ["KEYWORD"],
      },
      { traceId: "glossary-keyword-recall", pluginManager },
    );
    expect(keywordRecall.outcomes.KEYWORD.status).toBe("SUCCEEDED");
    expect(getTermRecallCandidates(keywordRecall)).toEqual([
      expect.objectContaining({
        term: "Running tests",
        translation: "运行测试",
        evidences: [expect.objectContaining({ channel: "keyword" })],
      }),
    ]);

    const statesById = new Map(states.map((state) => [state.id, state]));
    const memoryStateIds = new Set(
      states
        .filter((state) => state.targetKind === "MEMORY_ITEM")
        .map((state) => state.id),
    );
    const termStateIds = new Set(
      states
        .filter((state) => state.targetKind === "TERM_CONCEPT")
        .map((state) => state.id),
    );
    expect(
      memoryVariants.every((variant) => {
        const state = statesById.get(variant.derivationStateId);
        return (
          state?.targetKind === "MEMORY_ITEM" &&
          state.targetId === String(variant.memoryItemId) &&
          state.languageId === variant.languageId &&
          state.currentCanonicalInputVersion ===
            variant.canonicalInputVersion &&
          state.currentDerivationVersion === variant.recallDerivationVersion &&
          variant.memoryId === memory.id &&
          memoryStateIds.has(variant.derivationStateId) &&
          !termStateIds.has(variant.derivationStateId)
        );
      }),
    ).toBe(true);
    expect(
      termVariants.every((variant) => {
        const state = statesById.get(variant.derivationStateId);
        return (
          state?.targetKind === "TERM_CONCEPT" &&
          state.targetId === String(variant.conceptId) &&
          state.languageId === variant.languageId &&
          state.currentCanonicalInputVersion ===
            variant.canonicalInputVersion &&
          state.currentDerivationVersion === variant.recallDerivationVersion &&
          glossaryCreated.termIds.includes(variant.meta.sourceTermId) &&
          termStateIds.has(variant.derivationStateId) &&
          !memoryStateIds.has(variant.derivationStateId)
        );
      }),
    ).toBe(true);
  });
});
