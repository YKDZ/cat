import { language } from "@cat/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { executeQuery } from "@/executor";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

import { listLanguages } from "./list-languages.query";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
  await testDb.client
    .insert(language)
    .values([{ id: "en" }, { id: "fr" }, { id: "zh-Hans" }])
    .onConflictDoNothing();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("listLanguages", () => {
  test("filters search results before paginating", async () => {
    const result = await executeQuery({ db: testDb.client }, listLanguages, {
      page: 0,
      pageSize: 1,
      searchQuery: "zh-Hans",
    });

    expect(result.languages.map((row) => row.id)).toEqual(["zh-Hans"]);
    expect(result.hasMore).toBe(false);
  });
});
