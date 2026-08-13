import { randomUUID } from "node:crypto";

import { inArray, vectorizedString } from "@cat/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  attachChunkSetToString,
  createChunkSet,
  createVectorizedStrings,
  ensureLanguages,
} from "#/commands/index.ts";
import { executeCommand } from "#/executor.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en"],
  });
});

afterAll(async () => {
  await testDb.cleanup();
});

const seedStrings = async (amount: number): Promise<number[]> =>
  await executeCommand({ db: testDb.client }, createVectorizedStrings, {
    data: Array.from({ length: amount }, () => ({
      text: `attach-chunk-set-${randomUUID()}`,
      languageId: "en",
    })),
  });

const loadStrings = async (stringIds: number[]) =>
  await testDb.client
    .select({
      id: vectorizedString.id,
      chunkSetId: vectorizedString.chunkSetId,
      status: vectorizedString.status,
    })
    .from(vectorizedString)
    .where(inArray(vectorizedString.id, stringIds))
    .orderBy(vectorizedString.id);

describe("attachChunkSetToString PostgreSQL contract", () => {
  test("maps distinct chunk sets in one command without changing non-target rows", async () => {
    const stringIds = await seedStrings(3);
    const firstChunkSet = await executeCommand(
      { db: testDb.client },
      createChunkSet,
      {},
    );
    const secondChunkSet = await executeCommand(
      { db: testDb.client },
      createChunkSet,
      {},
    );

    await executeCommand({ db: testDb.client }, attachChunkSetToString, {
      updates: [
        { stringId: stringIds[0]!, chunkSetId: firstChunkSet.id },
        { stringId: stringIds[1]!, chunkSetId: secondChunkSet.id },
      ],
    });

    expect(await loadStrings(stringIds)).toEqual([
      {
        id: stringIds[0],
        chunkSetId: firstChunkSet.id,
        status: "ACTIVE",
      },
      {
        id: stringIds[1],
        chunkSetId: secondChunkSet.id,
        status: "ACTIVE",
      },
      { id: stringIds[2], chunkSetId: null, status: "PENDING_VECTORIZE" },
    ]);
  });

  test("empty input leaves database state unchanged", async () => {
    const stringIds = await seedStrings(1);
    const before = await loadStrings(stringIds);

    await executeCommand({ db: testDb.client }, attachChunkSetToString, {
      updates: [],
    });

    expect(await loadStrings(stringIds)).toEqual(before);
  });

  test("duplicate string IDs fail before changing database state", async () => {
    const stringIds = await seedStrings(1);
    const firstChunkSet = await executeCommand(
      { db: testDb.client },
      createChunkSet,
      {},
    );
    const secondChunkSet = await executeCommand(
      { db: testDb.client },
      createChunkSet,
      {},
    );
    const before = await loadStrings(stringIds);

    await expect(
      executeCommand({ db: testDb.client }, attachChunkSetToString, {
        updates: [
          { stringId: stringIds[0]!, chunkSetId: firstChunkSet.id },
          { stringId: stringIds[0]!, chunkSetId: secondChunkSet.id },
        ],
      }),
    ).rejects.toThrow(`Duplicate stringId ${stringIds[0]}.`);
    expect(await loadStrings(stringIds)).toEqual(before);
  });
});
