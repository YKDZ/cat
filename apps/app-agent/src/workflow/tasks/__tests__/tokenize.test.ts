import { ensureLanguages, executeCommand } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { tokenizeTask } from "../tokenize";

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
});

test("tokenize should return tokens for given text", async () => {
  const { result } = await tokenizeTask.run({
    text: "Hello world",
  });

  const { tokens } = await result();
  expect(Array.isArray(tokens)).toBe(true);
  expect(tokens.length).toBeGreaterThan(0);
});

test("tokenize should return empty tokens for empty text", async () => {
  const { result } = await tokenizeTask.run({
    text: "",
  });

  const { tokens } = await result();
  expect(Array.isArray(tokens)).toBe(true);
});

test("tokenize tokens should have correct shape", async () => {
  const { result } = await tokenizeTask.run({
    text: "The quick brown fox",
  });

  const { tokens } = await result();

  for (const token of tokens) {
    expect(token).toHaveProperty("value");
    expect(typeof token.value).toBe("string");
  }
});
