import { ensureLanguages, executeCommand } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/typed-dsl";

import { tokenizeGraph } from "../tokenize";

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

  createDefaultGraphRuntime(drizzle, pluginManager);
});

test("tokenize should return tokens for given text", async () => {
  const { tokens } = await runGraph(tokenizeGraph, {
    text: "Hello world",
  });
  expect(Array.isArray(tokens)).toBe(true);
  expect(tokens.length).toBeGreaterThan(0);
});

test("tokenize should return empty tokens for empty text", async () => {
  const { tokens } = await runGraph(tokenizeGraph, {
    text: "",
  });
  expect(Array.isArray(tokens)).toBe(true);
});

test("tokenize tokens should have correct shape", async () => {
  const { tokens } = await runGraph(tokenizeGraph, {
    text: "The quick brown fox",
  });

  for (const token of tokens) {
    expect(token).toHaveProperty("value");
    expect(typeof token.value).toBe("string");
  }
});
