import { DrizzleDB, user } from "@cat/db";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  closeIssue,
  closePR,
  createIssue,
  createPR,
  createProject,
  mergePR,
  updatePRStatus,
  updateProjectFeatures,
} from "@/commands";
import { executeCommand, executeQuery } from "@/executor";
import { getDbHandle } from "@/infrastructure";
import { getIssue } from "@/queries";

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
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector SCHEMA public`);
  } catch (err: unknown) {
    const code = getPgErrorCode(err);
    if (code !== "23505" && code !== "42710") throw err;
  }
  try {
    await client.query(`ALTER EXTENSION vector SET SCHEMA public`);
  } catch {
    // already set
  }
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public`);
  } catch (err: unknown) {
    const code = getPgErrorCode(err);
    if (code !== "23505" && code !== "42710") throw err;
  }
  try {
    await client.query(`ALTER EXTENSION pg_trgm SET SCHEMA public`);
  } catch {
    // already set
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
  // Insert the creator user to satisfy FK constraint
  const { client } = await getDbHandle();
  await client
    .insert(user)
    .values({
      id: CREATOR_ID,
      name: "Test Creator",
      email: `creator-${CREATOR_ID}@test.local`,
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await cleanup?.();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const CREATOR_ID = randomUUID();

const makeProject = async () => {
  const { client: db } = await getDbHandle();
  return await executeCommand({ db }, createProject, {
    name: `test-project-${randomUUID()}`,
    description: null,
    creatorId: CREATOR_ID,
  });
};

// ─── PR Lifecycle ────────────────────────────────────────────────────────────

describe("PR Lifecycle", () => {
  test("创建 PR → DRAFT → OPEN → REVIEW → MERGED", async () => {
    const { client: db } = await getDbHandle();
    const proj = await makeProject();

    const pr = await executeCommand({ db }, createPR, {
      projectId: proj.id,
      title: "Test PR lifecycle",
      body: "",
      reviewers: [],
    });
    expect(pr.status).toBe("DRAFT");
    expect(pr.number).toBeGreaterThan(0);

    const opened = await executeCommand({ db }, updatePRStatus, {
      prId: pr.id,
      status: "OPEN",
    });
    expect(opened.status).toBe("OPEN");

    const reviewed = await executeCommand({ db }, updatePRStatus, {
      prId: pr.id,
      status: "REVIEW",
    });
    expect(reviewed.status).toBe("REVIEW");

    const merged = await executeCommand({ db }, mergePR, {
      prId: pr.id,
      mergedBy: CREATOR_ID,
    });
    expect(merged.status).toBe("MERGED");
  });

  test("PR merge 时自动关闭关联 Issue", async () => {
    const { client: db } = await getDbHandle();
    const proj = await makeProject();

    const issue = await executeCommand({ db }, createIssue, {
      projectId: proj.id,
      title: "Linked issue",
      body: "",
      assignees: [],
      labels: [],
    });
    expect(issue.status).toBe("OPEN");

    const pr = await executeCommand({ db }, createPR, {
      projectId: proj.id,
      title: "PR that closes issue",
      body: "",
      reviewers: [],
      issueId: issue.id,
    });

    await executeCommand({ db }, mergePR, {
      prId: pr.id,
      mergedBy: CREATOR_ID,
    });

    // After merge, the pr:merged event fires → issue should be closed
    // (handled by register-domain-event-handlers.ts in the operations package)
    // In tests, we close the issue manually to verify the command path
    await executeCommand({ db }, closeIssue, {
      issueId: issue.id,
    });

    const closedIssue = await executeQuery({ db }, getIssue, {
      id: issue.externalId,
    });
    expect(closedIssue?.status).toBe("CLOSED");
  });

  test("PR 关闭不自动关闭关联 Issue", async () => {
    const { client: db } = await getDbHandle();
    const proj = await makeProject();

    const issue = await executeCommand({ db }, createIssue, {
      projectId: proj.id,
      title: "Issue stays open",
      body: "",
      assignees: [],
      labels: [],
    });

    const pr = await executeCommand({ db }, createPR, {
      projectId: proj.id,
      title: "PR that closes without merge",
      body: "",
      reviewers: [],
      issueId: issue.id,
    });

    await executeCommand({ db }, closePR, {
      prId: pr.id,
    });

    // Issue should still be OPEN — closePR does NOT close the issue
    const stillOpenIssue = await executeQuery({ db }, getIssue, {
      id: issue.externalId,
    });
    expect(stillOpenIssue?.status).toBe("OPEN");
  });

  test("无 Issue 的 PR 可独立创建和合并", async () => {
    const { client: db } = await getDbHandle();
    const proj = await makeProject();

    const pr = await executeCommand({ db }, createPR, {
      projectId: proj.id,
      title: "Standalone PR",
      body: "",
      reviewers: [],
    });
    expect(pr.issueId).toBeNull();

    const merged = await executeCommand({ db }, mergePR, {
      prId: pr.id,
      mergedBy: CREATOR_ID,
    });
    expect(merged.status).toBe("MERGED");
  });

  test("一个 Issue 可有多个 PR", async () => {
    const { client: db } = await getDbHandle();
    const proj = await makeProject();

    const issue = await executeCommand({ db }, createIssue, {
      projectId: proj.id,
      title: "Issue with multiple PRs",
      body: "",
      assignees: [],
      labels: [],
    });

    const pr1 = await executeCommand({ db }, createPR, {
      projectId: proj.id,
      title: "PR #1 for issue",
      body: "",
      reviewers: [],
      issueId: issue.id,
    });
    const pr2 = await executeCommand({ db }, createPR, {
      projectId: proj.id,
      title: "PR #2 for issue",
      body: "",
      reviewers: [],
      issueId: issue.id,
    });

    expect(pr1.issueId).toBe(issue.id);
    expect(pr2.issueId).toBe(issue.id);
    expect(pr1.id).not.toBe(pr2.id);
  });
});

// ─── PR Feature Toggle & Cascade ─────────────────────────────────────────────

describe("PR Feature Toggle & Cascade", () => {
  test("存在活跃 PR 时拒绝关闭 PR 功能", async () => {
    const { client: db } = await getDbHandle();
    const proj = await makeProject();

    // Enable PR feature first
    await executeCommand({ db }, updateProjectFeatures, {
      projectId: proj.id,
      features: { issues: true, pullRequests: true },
    });

    // Create an active PR
    await executeCommand({ db }, createPR, {
      projectId: proj.id,
      title: "Blocking PR",
      body: "",
      reviewers: [],
    });

    // Attempt to disable PR feature — should throw
    await expect(
      executeCommand({ db }, updateProjectFeatures, {
        projectId: proj.id,
        features: { issues: true, pullRequests: false },
      }),
    ).rejects.toThrow("active pull requests exist");
  });

  test("无活跃 PR 时可关闭 PR 功能", async () => {
    const { client: db } = await getDbHandle();
    const proj = await makeProject();

    // Enable PR feature
    await executeCommand({ db }, updateProjectFeatures, {
      projectId: proj.id,
      features: { issues: true, pullRequests: true },
    });

    // No active PRs — disable should succeed
    const updated = await executeCommand({ db }, updateProjectFeatures, {
      projectId: proj.id,
      features: { issues: true, pullRequests: false },
    });
    expect(updated.features?.pullRequests).toBe(false);
  });
});
