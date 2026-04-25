import type { CatPlugin } from "@cat/plugin-core";
import type { PluginManifest } from "@cat/shared";

import {
  createElements,
  createMemory,
  createRootDocument,
  createTranslations,
  createUser,
  ensureLanguages,
  executeCommand,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared";
import { setupTestDB, TestPluginLoader, type TestDB } from "@cat/test-utils";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  eq,
  memoryItem,
  memoryRecallVariant,
  project,
  vectorizedString,
} from "../../db/dist/index.js";
import { collectMemoryRecallOp } from "./collect-memory-recall";
import { insertMemory } from "./memory";

const require = createRequire(import.meta.url);
const basicTokenizerModule: unknown = require("../../../@cat-plugin/basic-tokenizer/dist/index.js");

const isCatPlugin = (value: unknown): value is CatPlugin => {
  return typeof value === "object" && value !== null;
};

const basicTokenizerPlugin = (() => {
  if (
    typeof basicTokenizerModule === "object" &&
    basicTokenizerModule !== null &&
    "default" in basicTokenizerModule &&
    isCatPlugin(basicTokenizerModule.default)
  ) {
    return basicTokenizerModule.default;
  }

  throw new Error("basic-tokenizer dist module does not expose a valid plugin");
})();

const BASIC_TOKENIZER_MANIFEST: PluginManifest = {
  id: "basic-tokenizer",
  version: "0.1.0",
  entry: "dist/index.js",
  services: [
    { id: "newline-tokenizer", type: "TOKENIZER", dynamic: false },
    { id: "number-tokenizer", type: "TOKENIZER", dynamic: false },
    { id: "whitespace-tokenizer", type: "TOKENIZER", dynamic: false },
    { id: "term-tokenizer", type: "TOKENIZER", dynamic: false },
    { id: "punctuation-tokenizer", type: "TOKENIZER", dynamic: false },
  ],
};

describe("memory recall integration", () => {
  let db: TestDB;
  let cleanup: () => Promise<void>;
  let memoryId: string;
  let forwardTranslationId: number;
  let reversedTranslationId: number;

  const createTranslationRecord = async ({
    creatorId,
    documentId,
    sourceText,
    sourceLanguageId,
    translationText,
    translationLanguageId,
  }: {
    creatorId: string;
    documentId: string;
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
            documentId,
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
            translatableElementId: elementId,
            translatorId: creatorId,
            stringId: translation.id,
          },
        ],
      },
    );

    return translationId;
  };

  beforeAll(async () => {
    db = await setupTestDB();
    cleanup = db.cleanup;

    PluginManager.clear();
    const loader = new TestPluginLoader();
    loader.registerPlugin(BASIC_TOKENIZER_MANIFEST, basicTokenizerPlugin);

    const pluginManager = PluginManager.get("GLOBAL", "", loader);

    await pluginManager.getDiscovery().syncDefinitions(db.client);
    await pluginManager.install(db.client, "mock");
    await pluginManager.install(db.client, "basic-tokenizer");
    await db.client.transaction(async (tx) => {
      await pluginManager.restore(tx);
    });

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
      createRootDocument,
      {
        projectId: insertedProject.id,
        creatorId: user.id,
        name: "<root>",
      },
    );

    forwardTranslationId = await createTranslationRecord({
      creatorId: user.id,
      documentId: rootDocument.id,
      sourceText: "Order 42 is completed",
      sourceLanguageId: "en",
      translationText: "订单 42 已完成",
      translationLanguageId: "zh-Hans",
    });

    reversedTranslationId = await createTranslationRecord({
      creatorId: user.id,
      documentId: rootDocument.id,
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

    await db.client.transaction(async (tx) => {
      await insertMemory(
        tx,
        [memoryId],
        [forwardTranslationId, reversedTranslationId],
      );
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
});
