import {
  ensureLanguages,
  executeCommand,
  registerPluginDefinition,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import { statisticalTermExtractOp } from "./statistical-term-extract";

const setupPluginManager = async (
  loader: TestPluginLoader,
  scopeId: string,
  pluginIds: string[],
) => {
  const db = await setupTestDB();

  PluginManager.clear();
  const pluginManager = PluginManager.get("PROJECT", scopeId, loader);

  const uniqueIds = [...new Set(pluginIds)];
  await Promise.all(
    uniqueIds.map(async (id) => {
      const data = await loader.getData(id);
      await executeCommand({ db: db.client }, registerPluginDefinition, {
        pluginId: id,
        version: data.version,
        name: data.name,
        entry: data.entry ?? "index.js",
        overview: data.overview ?? "",
        iconUrl: data.iconURL ?? null,
        configSchema: data.config,
      });
    }),
  );

  await Promise.all(
    pluginIds.map(async (id) => pluginManager.install(db.client, id)),
  );

  await db.client.transaction(async (tx) => {
    await pluginManager.restore(
      tx,
      // @ts-expect-error no need for hono in tests
      {},
    );
  });

  await executeCommand({ db: db.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans", "ja", "ko"],
  });

  return { cleanup: db.cleanup, pluginManager };
};

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  PluginManager.clear();
  await cleanup?.();
  cleanup = undefined;
});

describe("statisticalTermExtractOp", () => {
  it("returns intl-fallback when no NLP plugin is installed", async () => {
    const runtime = await setupPluginManager(
      new TestPluginLoader({ includeNlpSegmenter: true }),
      "statistical-term-extract-fallback",
      ["mock"],
    );
    cleanup = runtime.cleanup;

    const result = await statisticalTermExtractOp(
      {
        texts: [{ id: "1", elementId: 1, text: "Machine translation quality" }],
        languageId: "en",
        config: {
          maxTermTokens: 3,
          minDocFreq: 1,
          minTermLength: 2,
          tfIdfThreshold: 0,
          tfidfWeight: 0.6,
          cvalueWeight: 0.4,
        },
      },
      { pluginManager: runtime.pluginManager, traceId: "test-trace-fallback" },
    );

    expect(result.nlpSegmenterUsed).toBe("intl-fallback");
  });

  it("returns plugin when the mock NLP segmenter is explicitly installed", async () => {
    const runtime = await setupPluginManager(
      new TestPluginLoader({ includeNlpSegmenter: true }),
      "statistical-term-extract-plugin",
      ["mock", "mock-nlp-segmenter"],
    );
    cleanup = runtime.cleanup;

    const result = await statisticalTermExtractOp(
      {
        texts: [{ id: "1", elementId: 1, text: "Machine translation quality" }],
        languageId: "en",
        config: {
          maxTermTokens: 3,
          minDocFreq: 1,
          minTermLength: 2,
          tfIdfThreshold: 0,
          tfidfWeight: 0.6,
          cvalueWeight: 0.4,
        },
      },
      { pluginManager: runtime.pluginManager, traceId: "test-trace-plugin" },
    );

    expect(result.nlpSegmenterUsed).toBe("plugin");
  });
});
