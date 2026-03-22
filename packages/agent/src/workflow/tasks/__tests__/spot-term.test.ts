import { createUser, ensureLanguages, executeCommand } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/typed-dsl";

import { spotTermGraph } from "../spot-term";

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
      tx,
      // @ts-expect-error no need for hono
      {},
    );
  });

  await executeCommand({ db: drizzle }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  await executeCommand({ db: drizzle }, createUser, {
    email: "admin@encmys.cn",
    name: "YKDZ",
  });

  createDefaultGraphRuntime(drizzle, pluginManager);
});

test("spot-term should return candidates from text", async () => {
  const { candidates } = await runGraph(spotTermGraph, {
    text: "The dirt block and diamond block are common in Minecraft.",
    languageId: "en",
  });
  expect(candidates).toBeDefined();
  expect(Array.isArray(candidates)).toBe(true);
});

test("spot-term should fail when given non-existent extractor ID", async () => {
  await expect(
    runGraph(spotTermGraph, {
      text: "Some text with terms",
      languageId: "en",
      termExtractorId: 99999,
    }),
  ).rejects.toThrow();
});

test("spot-term candidate should have correct shape", async () => {
  const { candidates } = await runGraph(spotTermGraph, {
    text: "dirt",
    languageId: "en",
  });

  for (const candidate of candidates) {
    expect(candidate).toHaveProperty("text");
    expect(candidate).toHaveProperty("normalizedText");
    expect(candidate).toHaveProperty("range");
    expect(typeof candidate.text).toBe("string");
    expect(typeof candidate.normalizedText).toBe("string");
    expect(Array.isArray(candidate.range)).toBe(true);

    for (const range of candidate.range) {
      expect(range).toHaveProperty("start");
      expect(range).toHaveProperty("end");
      expect(typeof range.start).toBe("number");
      expect(typeof range.end).toBe("number");
    }
  }
});
