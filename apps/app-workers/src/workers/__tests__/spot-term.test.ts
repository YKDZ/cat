import { afterAll, beforeAll, expect, test } from "vitest";
import { language, user } from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { spotTermTask } from "../spot-term.ts";

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
      tx, // @ts-expect-error no need for hono
      {},
    );
  });

  // Seed
  await drizzle.transaction(async (tx) => {
    await tx.insert(language).values([
      {
        id: "en",
      },
      {
        id: "zh-Hans",
      },
    ]);

    assertSingleNonNullish(
      await tx
        .insert(user)
        .values({
          email: "admin@encmys.cn",
          name: "YKDZ",
        })
        .returning({ id: user.id }),
    );
  });
});

test("spot-term should return candidates from text", async () => {
  const { result } = await spotTermTask.run({
    text: "The dirt block and diamond block are common in Minecraft.",
    languageId: "en",
  });

  const { candidates } = await result();

  // TestTermExtractor mock should return some candidates
  expect(candidates).toBeDefined();
  expect(Array.isArray(candidates)).toBe(true);
});

test("spot-term should fail when given non-existent extractor ID", async () => {
  const { result } = await spotTermTask.run({
    text: "Some text with terms",
    languageId: "en",
    termExtractorId: 99999,
  });

  // Non-existent service ID throws at runtime
  await expect(result()).rejects.toThrow();
});

test("spot-term candidate should have correct shape", async () => {
  const { result } = await spotTermTask.run({
    text: "dirt",
    languageId: "en",
  });

  const { candidates } = await result();

  for (const candidate of candidates) {
    expect(candidate).toHaveProperty("text");
    expect(candidate).toHaveProperty("normalizedText");
    expect(candidate).toHaveProperty("range");
    expect(typeof candidate.text).toBe("string");
    expect(typeof candidate.normalizedText).toBe("string");
    expect(Array.isArray(candidate.range)).toBe(true);

    for (const r of candidate.range) {
      expect(r).toHaveProperty("start");
      expect(r).toHaveProperty("end");
      expect(typeof r.start).toBe("number");
      expect(typeof r.end).toBe("number");
    }
  }
});
