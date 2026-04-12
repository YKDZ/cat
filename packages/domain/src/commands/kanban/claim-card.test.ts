import { DrizzleDB } from "@cat/db";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";

import { addCardDep, claimCard, createBoard, createCard } from "@/commands";
import { executeCommand } from "@/executor";
import { getDbHandle } from "@/infrastructure";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cleanup: (() => Promise<void>) | undefined;

const getPgErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
};

const setupTestDB = async (): Promise<
  DrizzleDB & { cleanup: () => Promise<void> }
> => {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://user:pass@localhost:5432/cat";

  const db = new DrizzleDB();
  await db.connect();
  const client = db.client.$client;

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
  } catch (err: unknown) {
    const code = getPgErrorCode(err);
    if (code !== "23505" && code !== "42710") {
      throw err;
    }
  }

  try {
    await client.query("ALTER EXTENSION vector SET SCHEMA public");
  } catch {
    // Ignore duplicate / already-set extension state in tests.
  }

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public");
  } catch (err: unknown) {
    const code = getPgErrorCode(err);
    if (code !== "23505" && code !== "42710") {
      throw err;
    }
  }

  try {
    await client.query("ALTER EXTENSION pg_trgm SET SCHEMA public");
  } catch {
    // Ignore duplicate / already-set extension state in tests.
  }

  const schemaName = `test_${randomUUID().replace(/-/g, "_")}`;
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}", public`);
  await db.migrate(path.resolve(__dirname, "../../../../db/drizzle"));

  globalThis["__DRIZZLE_DB__"] = db;

  const cleanupDB = async () => {
    if (globalThis["__DRIZZLE_DB__"] === db) {
      delete globalThis["__DRIZZLE_DB__"];
    }

    try {
      await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    } finally {
      await db.disconnect();
    }
  };

  return Object.assign(db, { cleanup: cleanupDB });
};

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;
});

afterAll(async () => {
  await cleanup?.();
});

test("claimCard returns the highest-priority available card", async () => {
  const { client: db } = await getDbHandle();
  const board = await executeCommand({ db }, createBoard, {
    name: "Phase0b priority board",
    columns: [{ id: "todo", name: "TODO" }],
  });

  const low = await executeCommand({ db }, createCard, {
    boardId: board.id,
    columnId: "todo",
    title: "Low priority card",
    description: "",
    priority: 10,
    labels: [],
    batchSize: 1,
    status: "OPEN",
  });
  const high = await executeCommand({ db }, createCard, {
    boardId: board.id,
    columnId: "todo",
    title: "High priority card",
    description: "",
    priority: 20,
    labels: [],
    batchSize: 1,
    status: "OPEN",
  });

  const claimed = await executeCommand({ db }, claimCard, {
    boardId: board.id,
    claimableStatuses: ["OPEN", "NEEDS_REWORK"],
  });

  expect(claimed).toMatchObject({
    id: high.id,
    externalId: high.externalId,
    title: high.title,
  });
  expect(claimed?.id).not.toBe(low.id);
});

test("claimCard skips cards whose dependencies are not done", async () => {
  const { client: db } = await getDbHandle();
  const board = await executeCommand({ db }, createBoard, {
    name: "Phase0b dependency board",
    columns: [{ id: "todo", name: "TODO" }],
  });

  const ready = await executeCommand({ db }, createCard, {
    boardId: board.id,
    columnId: "todo",
    title: "Ready card",
    description: "",
    priority: 20,
    labels: [],
    batchSize: 1,
    status: "OPEN",
  });
  const blockedDependency = await executeCommand({ db }, createCard, {
    boardId: board.id,
    columnId: "todo",
    title: "Dependency card",
    description: "",
    priority: 5,
    labels: [],
    batchSize: 1,
    status: "OPEN",
  });
  const blocked = await executeCommand({ db }, createCard, {
    boardId: board.id,
    columnId: "todo",
    title: "Blocked card",
    description: "",
    priority: 100,
    labels: [],
    batchSize: 1,
    status: "OPEN",
  });

  await executeCommand({ db }, addCardDep, {
    cardId: blocked.id,
    dependsOnCardId: blockedDependency.id,
    depType: "FINISH_TO_START",
  });

  const claimed = await executeCommand({ db }, claimCard, {
    boardId: board.id,
    claimableStatuses: ["OPEN", "NEEDS_REWORK"],
  });

  expect(claimed).toMatchObject({
    id: ready.id,
    externalId: ready.externalId,
    title: ready.title,
  });
  expect(claimed?.id).not.toBe(blocked.id);
});

test("claimCard returns null when no claimable card is available", async () => {
  const { client: db } = await getDbHandle();
  const board = await executeCommand({ db }, createBoard, {
    name: "Phase0b empty board",
    columns: [{ id: "todo", name: "TODO" }],
  });

  await executeCommand({ db }, createCard, {
    boardId: board.id,
    columnId: "todo",
    title: "Completed card",
    description: "",
    priority: 1,
    labels: [],
    batchSize: 1,
    status: "DONE",
  });

  const claimed = await executeCommand({ db }, claimCard, {
    boardId: board.id,
    claimableStatuses: ["OPEN", "NEEDS_REWORK"],
  });

  expect(claimed).toBeNull();
});
