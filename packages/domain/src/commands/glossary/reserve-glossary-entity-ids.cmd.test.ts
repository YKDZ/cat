import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { executeCommand, executeQuery } from "#/executor.ts";
import { getTermConceptCanonicalSnapshots } from "#/queries/recall-derivation/get-term-concept-canonical-snapshots.query.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

import { reserveGlossaryEntityIds } from "./reserve-glossary-entity-ids.cmd.ts";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

describe("reserveGlossaryEntityIds", () => {
  it("reserves distinct canonical IDs without creating a glossary aggregate", async () => {
    const first = await executeCommand(
      { db: testDb.client },
      reserveGlossaryEntityIds,
      { conceptCount: 2, termCount: 3 },
    );
    const second = await executeCommand(
      { db: testDb.client },
      reserveGlossaryEntityIds,
      { conceptCount: 1, termCount: 1 },
    );

    expect(first.conceptIds).toHaveLength(2);
    expect(first.termIds).toHaveLength(3);
    expect(second.conceptIds[0]).toBeGreaterThan(first.conceptIds[1]!);
    expect(second.termIds[0]).toBeGreaterThan(first.termIds[2]!);
    expect(new Set([...first.conceptIds, ...second.conceptIds]).size).toBe(3);
    expect(new Set([...first.termIds, ...second.termIds]).size).toBe(4);

    await expect(
      executeQuery({ db: testDb.client }, getTermConceptCanonicalSnapshots, {
        conceptIds: [...first.conceptIds, ...second.conceptIds],
      }),
    ).resolves.toEqual([]);
  });
});
