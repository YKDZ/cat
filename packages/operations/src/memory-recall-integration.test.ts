import {
  createElements,
  createMemory,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
  executeCommand,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import type {
  CatPlugin,
  LanguageAnalysisContext,
  ParserContext,
  ParseResult,
} from "@cat/plugin-core";
import {
  LanguageAnalyzer,
  PluginManager,
  Tokenizer,
  TokenizerPriority,
} from "@cat/plugin-core";
import {
  assertSingleNonNullish,
  LanguageAnalysisResultSchema,
  LanguageAnalysisWildcardSelectionKey,
  PluginManifestSchema,
  type RecallDerivationReference,
} from "@cat/shared";
import {
  and,
  eq,
  memoryItem,
  memoryRecallVariant,
  project,
  recallDerivationState,
  setupTestDB,
  testLanguageAnalyzerManifest,
  TestLanguageAnalyzer,
  TestPluginLoader,
  type TestDB,
  vectorizedString,
} from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requireFixtureValue } from "#/testing/require-fixture-value.ts";

import { collectMemoryRecallOp } from "./collect-memory-recall.ts";
import { validateLanguageAnalyzerConfiguration } from "./language-analysis-requirement.ts";
import {
  assessRecallDerivationFreshness,
  startRecallDerivationWorker,
  waitForRecallDerivationFresh,
} from "./memory-recall-derivation.ts";
import { insertMemory } from "./memory.ts";

class TestNumberTokenizer extends Tokenizer {
  public override getId = (): string => "test-number-tokenizer";

  public override getPriority = (): TokenizerPriority =>
    TokenizerPriority.LITERAL;

  public override parse = (context: ParserContext): ParseResult | undefined => {
    const value = context.source.slice(context.cursor).match(/^[0-9]+/)?.[0];
    if (!value) return undefined;

    return {
      token: {
        type: "number",
        value,
        start: context.cursor,
        end: context.cursor + value.length,
      },
    };
  };
}

const basicTokenizerPlugin = {
  services: () => [new TestNumberTokenizer()],
} satisfies CatPlugin;

const BASIC_TOKENIZER_MANIFEST = PluginManifestSchema.parse({
  id: "basic-tokenizer",
  version: "0.1.0",
  entry: "dist/index.js",
  services: [
    { id: "test-number-tokenizer", type: "TOKENIZER", dynamic: false },
  ],
});

class MutableGenerationLanguageAnalyzer extends LanguageAnalyzer {
  public static generation = "a";
  public static failuresRemaining = 0;
  readonly #delegate = new TestLanguageAnalyzer({
    scopeType: "GLOBAL",
    scopeId: "",
  });

  public override getId = (): string => "test-language-analyzer";

  public override getLanguageAnalysisConfigurationAssessment = () =>
    this.#delegate.getLanguageAnalysisConfigurationAssessment();

  public override analyze = async (context: LanguageAnalysisContext) => {
    if (MutableGenerationLanguageAnalyzer.failuresRemaining > 0) {
      MutableGenerationLanguageAnalyzer.failuresRemaining -= 1;
      throw new Error("transient analyzer probe failure");
    }
    const result = await this.#delegate.analyze(context);
    return LanguageAnalysisResultSchema.parse({
      ...result,
      attestation: {
        ...result.attestation,
        generation: {
          ...result.attestation.generation,
          id: `sha256:${MutableGenerationLanguageAnalyzer.generation.repeat(64)}`,
          planDigest: MutableGenerationLanguageAnalyzer.generation.repeat(64),
        },
      },
    });
  };
}

const mutableLanguageAnalyzerPlugin = {
  services: async (ctx) => {
    if (ctx.scopeType === "GLOBAL")
      return [new MutableGenerationLanguageAnalyzer()];
    throw new TypeError(`Unsupported test plugin scope: ${ctx.scopeType}`);
  },
} satisfies CatPlugin;

describe("memory recall integration", () => {
  let db: TestDB;
  let pluginManager: PluginManager;
  let cleanup: () => Promise<void>;
  let memoryId: string;
  let forwardTranslationId: number;
  let reversedTranslationId: number;
  let derivations: RecallDerivationReference[];

  const createTranslationRecord = async ({
    creatorId,
    projectId,
    contentNodeId,
    sourceText,
    sourceLanguageId,
    translationText,
    translationLanguageId,
  }: {
    creatorId: string;
    projectId: string;
    contentNodeId: string;
    sourceText: string;
    sourceLanguageId: string;
    translationText: string;
    translationLanguageId: string;
  }) => {
    const source = assertSingleNonNullish(
      await db.client
        .insert(vectorizedString)
        .values({
          value: sourceText,
          languageId: sourceLanguageId,
        })
        .returning({ id: vectorizedString.id }),
    );

    const translation = assertSingleNonNullish(
      await db.client
        .insert(vectorizedString)
        .values({
          value: translationText,
          languageId: translationLanguageId,
        })
        .returning({ id: vectorizedString.id }),
    );

    const [elementId] = await executeCommand(
      { db: db.client },
      createElements,
      {
        data: [
          {
            creatorId,
            projectId,
            primaryContentNodeId: contentNodeId,
            importerId: "test",
            sourceRootRef: `project:${projectId}`,
            sourceNodeRef: `test:${encodeURIComponent(sourceText)}`,
            stableSourceRef: `test:${encodeURIComponent(sourceText)}`,
            stringId: source.id,
          },
        ],
      },
    );

    const [translationId] = await executeCommand(
      { db: db.client },
      createTranslations,
      {
        data: [
          {
            translatableElementId: requireFixtureValue(elementId),
            translatorId: creatorId,
            stringId: translation.id,
          },
        ],
      },
    );

    return requireFixtureValue(translationId);
  };

  beforeAll(async () => {
    db = await setupTestDB();
    cleanup = db.cleanup;

    PluginManager.clear();
    MutableGenerationLanguageAnalyzer.generation = "a";
    const loader = new TestPluginLoader();
    loader.registerPlugin(
      testLanguageAnalyzerManifest,
      mutableLanguageAnalyzerPlugin,
    );
    loader.registerPlugin(BASIC_TOKENIZER_MANIFEST, basicTokenizerPlugin);

    pluginManager = PluginManager.get("GLOBAL", "", loader);

    await pluginManager.getDiscovery().syncDefinitions(db.client);
    await pluginManager.install(db.client, "mock");
    await pluginManager.install(db.client, "mock-language-analyzer");
    await pluginManager.install(db.client, "basic-tokenizer");
    await db.client.transaction(async (tx) => {
      await pluginManager.restore(tx);
    });
    const languageAnalyzer = pluginManager.getServices("LANGUAGE_ANALYZER")[0]!;
    const reference =
      pluginManager.createServiceImplementationReference(languageAnalyzer);
    const validated = await validateLanguageAnalyzerConfiguration(reference, {
      traceId: "memory-recall-selection",
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

    await executeCommand({ db: db.client }, ensureCoreRelationTypes, {});
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });

    const user = await executeCommand({ db: db.client }, createUser, {
      email: "memory-recall@example.com",
      name: "Memory Recall Tester",
    });

    const insertedProject = assertSingleNonNullish(
      await db.client
        .insert(project)
        .values({
          name: "Memory Recall Project",
          creatorId: user.id,
        })
        .returning({ id: project.id }),
    );

    const rootDocument = await executeCommand(
      { db: db.client },
      createRootContentNode,
      {
        projectId: insertedProject.id,
        creatorId: user.id,
      },
    );

    forwardTranslationId = await createTranslationRecord({
      creatorId: user.id,
      projectId: insertedProject.id,
      contentNodeId: rootDocument.id,
      sourceText: "Order 42 is completed",
      sourceLanguageId: "en",
      translationText: "订单 42 已完成",
      translationLanguageId: "zh-Hans",
    });

    reversedTranslationId = await createTranslationRecord({
      creatorId: user.id,
      projectId: insertedProject.id,
      contentNodeId: rootDocument.id,
      sourceText: "发票 42 已完成",
      sourceLanguageId: "zh-Hans",
      translationText: "Invoice 42 Completed",
      translationLanguageId: "en",
    });

    memoryId = (
      await executeCommand({ db: db.client }, createMemory, {
        name: "Integration Memory",
        creatorId: user.id,
      })
    ).id;

    const inserted = await db.client.transaction(async (tx) => {
      return await insertMemory(
        tx,
        [memoryId],
        [forwardTranslationId, reversedTranslationId],
      );
    });
    derivations = inserted.derivations;
    await waitForRecallDerivationFresh(derivations, {
      db: db.client,
      pluginManager,
      timeoutMs: 30_000,
    });
  });

  afterAll(async () => {
    PluginManager.clear();
    await cleanup?.();
  });

  it("builds recall variants during insert and adapts template hits", async () => {
    const forwardItem = assertSingleNonNullish(
      await db.client
        .select({ id: memoryItem.id })
        .from(memoryItem)
        .where(eq(memoryItem.translationId, forwardTranslationId)),
    );

    const variants = await db.client
      .select({
        querySide: memoryRecallVariant.querySide,
        variantType: memoryRecallVariant.variantType,
      })
      .from(memoryRecallVariant)
      .where(eq(memoryRecallVariant.memoryItemId, forwardItem.id));

    expect(
      variants.some(
        (variant) =>
          variant.querySide === "SOURCE" &&
          variant.variantType === "TOKEN_TEMPLATE",
      ),
    ).toBe(true);

    const results = await collectMemoryRecallOp(
      {
        text: "Order 43 is completed",
        normalizedText: "Order {NUM_0} is completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [memoryId],
        minVariantSimilarity: 0.99,
        maxAmount: 5,
      },
      { traceId: "memory-recall-forward" },
    );

    expect(results[0]?.source).toBe("Order 42 is completed");
    expect(results[0]?.translation).toBe("订单 42 已完成");
    expect(results[0]?.adaptedTranslation).toBe("订单 43 已完成");
    expect(
      results[0]?.evidences.some(
        (evidence) => evidence.matchedVariantType === "TOKEN_TEMPLATE",
      ),
    ).toBe(true);
  });

  it("returns caller-oriented results for reversed lexical and variant recall", async () => {
    const reversedExactResults = await collectMemoryRecallOp(
      {
        text: "订单 42 已完成",
        sourceLanguageId: "zh-Hans",
        translationLanguageId: "en",
        memoryIds: [memoryId],
        maxAmount: 5,
      },
      { traceId: "memory-recall-reversed-exact" },
    );

    expect(reversedExactResults[0]?.source).toBe("订单 42 已完成");
    expect(reversedExactResults[0]?.translation).toBe("Order 42 is completed");
    expect(
      reversedExactResults[0]?.evidences.some(
        (evidence) => evidence.channel === "exact",
      ),
    ).toBe(true);

    const reversedVariantResults = await collectMemoryRecallOp(
      {
        text: "invoice 42 completed",
        normalizedText: "invoice 42 completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [memoryId],
        minSimilarity: 1,
        minVariantSimilarity: 1,
        maxAmount: 5,
      },
      { traceId: "memory-recall-reversed-variant" },
    );

    expect(reversedVariantResults[0]?.source).toBe("Invoice 42 Completed");
    expect(reversedVariantResults[0]?.translation).toBe("发票 42 已完成");
    expect(
      reversedVariantResults[0]?.evidences.some(
        (evidence) => evidence.matchedVariantType === "CASE_FOLDED",
      ),
    ).toBe(true);
  });

  it("returns BM25 evidence for long English keyword queries", async () => {
    const results = await collectMemoryRecallOp(
      {
        text: "completed order 42 status",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [memoryId],
        minSimilarity: 0.99,
        minVariantSimilarity: 0.99,
        maxAmount: 5,
      },
      { traceId: "memory-recall-bm25-en" },
    );

    expect(results[0]?.source).toBe("Order 42 is completed");
    expect(results[0]?.translation).toBe("订单 42 已完成");
    expect(results[0]?.evidences.some((e) => e.channel === "bm25")).toBe(true);
    expect(results[0]?.confidence).toBeGreaterThan(0);
    expect(results[0]?.confidence).toBeLessThanOrEqual(1);
  });

  it("returns caller-oriented BM25 results for zh-Hans to en queries", async () => {
    const results = await collectMemoryRecallOp(
      {
        text: "发票 42 完成",
        sourceLanguageId: "zh-Hans",
        translationLanguageId: "en",
        memoryIds: [memoryId],
        minSimilarity: 0.99,
        minVariantSimilarity: 0.99,
        maxAmount: 5,
      },
      { traceId: "memory-recall-bm25-zh-hans" },
    );

    expect(results[0]?.source).toBe("发票 42 已完成");
    expect(results[0]?.translation).toBe("Invoice 42 Completed");
    expect(results[0]?.evidences.some((e) => e.channel === "bm25")).toBe(true);
    expect(results[0]?.confidence).toBeGreaterThan(0);
    expect(results[0]?.confidence).toBeLessThanOrEqual(1);
  });

  it("invalidates stale runtime generations at the production recall seam", async () => {
    const forwardItem = assertSingleNonNullish(
      await db.client
        .select({ id: memoryItem.id })
        .from(memoryItem)
        .where(eq(memoryItem.translationId, forwardTranslationId)),
    );
    const getEnglishState = async () =>
      assertSingleNonNullish(
        await db.client
          .select()
          .from(recallDerivationState)
          .where(
            and(
              eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
              eq(recallDerivationState.targetId, String(forwardItem.id)),
              eq(recallDerivationState.languageId, "en"),
            ),
          ),
      );

    const generationA = await getEnglishState();
    expect(generationA.status).toBe("FRESH");
    expect(generationA.currentDerivationVersion).toBe(
      generationA.requiredDerivationVersion,
    );

    MutableGenerationLanguageAnalyzer.generation = "b";
    const generationBAssessment = await assessRecallDerivationFreshness(
      derivations,
      { db: db.client, pluginManager },
    );
    expect(generationBAssessment.status).toBe("PENDING");
    const firstGenerationBRecall = await collectMemoryRecallOp(
      {
        text: "order 42 is completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [memoryId],
        minSimilarity: 1,
        minVariantSimilarity: 1,
        maxAmount: 5,
      },
      { traceId: "memory-recall-generation-b", pluginManager },
    );
    expect(
      firstGenerationBRecall
        .flatMap((result) => result.evidences)
        .some((evidence) => evidence.matchedVariantType !== undefined),
    ).toBe(false);
    const pendingB = await getEnglishState();
    expect(pendingB).toMatchObject({
      status: "PENDING",
      demandRevision: generationA.demandRevision + 1,
      currentDerivationVersion: generationA.currentDerivationVersion,
    });
    expect(pendingB.requiredDerivationVersion).not.toBe(
      generationA.requiredDerivationVersion,
    );

    await collectMemoryRecallOp(
      {
        text: "order 42 is completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [memoryId],
        maxAmount: 5,
      },
      { traceId: "memory-recall-generation-b-repeat", pluginManager },
    );
    expect((await getEnglishState()).demandRevision).toBe(
      pendingB.demandRevision,
    );

    await waitForRecallDerivationFresh(derivations, {
      db: db.client,
      pluginManager,
      timeoutMs: 30_000,
    });
    const freshB = await getEnglishState();
    expect(freshB.status).toBe("FRESH");
    expect(freshB.currentDerivationVersion).toBe(
      freshB.requiredDerivationVersion,
    );
    expect(freshB.currentDerivationVersion).not.toBe(
      generationA.currentDerivationVersion,
    );

    MutableGenerationLanguageAnalyzer.generation = "c";
    await collectMemoryRecallOp(
      {
        text: "order 42 is completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [memoryId],
        maxAmount: 5,
      },
      { traceId: "memory-recall-generation-c", pluginManager },
    );
    const pendingC = await getEnglishState();
    expect(pendingC.demandRevision).toBe(freshB.demandRevision + 1);

    MutableGenerationLanguageAnalyzer.generation = "a";
    await collectMemoryRecallOp(
      {
        text: "order 42 is completed",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [memoryId],
        maxAmount: 5,
      },
      { traceId: "memory-recall-generation-a-switchback", pluginManager },
    );
    const switchedBackA = await getEnglishState();
    expect(switchedBackA).toMatchObject({
      status: "PENDING",
      demandRevision: pendingC.demandRevision + 1,
      requiredDerivationVersion: generationA.currentDerivationVersion,
      currentDerivationVersion: freshB.currentDerivationVersion,
    });

    await waitForRecallDerivationFresh(derivations, {
      db: db.client,
      pluginManager,
      timeoutMs: 30_000,
    });
  });

  it("keeps the periodic worker online after a transient dependency failure", async () => {
    const forwardItem = assertSingleNonNullish(
      await db.client
        .select({ id: memoryItem.id })
        .from(memoryItem)
        .where(eq(memoryItem.translationId, forwardTranslationId)),
    );
    const readState = async () =>
      assertSingleNonNullish(
        await db.client
          .select()
          .from(recallDerivationState)
          .where(
            and(
              eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
              eq(recallDerivationState.targetId, String(forwardItem.id)),
              eq(recallDerivationState.languageId, "en"),
            ),
          ),
      );
    const before = await readState();
    expect(before.status).toBe("FRESH");

    const worker = await startRecallDerivationWorker({
      db: db.client,
      pluginManager,
      pollIntervalMs: 10,
      dependencyProbeIntervalMs: 20,
      initialErrorBackoffMs: 10,
      maxErrorBackoffMs: 20,
    });
    try {
      MutableGenerationLanguageAnalyzer.generation = "d";
      MutableGenerationLanguageAnalyzer.failuresRemaining = 1;
      const deadline = Date.now() + 10_000;
      let current = await readState();
      while (
        Date.now() < deadline &&
        !(
          current.status === "FRESH" &&
          current.currentDerivationVersion !== before.currentDerivationVersion
        )
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        current = await readState();
      }
      expect(current.status).toBe("FRESH");
      expect(current.currentDerivationVersion).not.toBe(
        before.currentDerivationVersion,
      );
      expect(current.demandRevision).toBeGreaterThan(before.demandRevision);
    } finally {
      await worker.stop();
    }
  });
});
