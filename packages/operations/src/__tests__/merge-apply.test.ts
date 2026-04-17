/**
 * @zh mergePRFull 集成测试 — 真实数据库（完整 merge + apply 流程）。
 * @en Integration tests for mergePRFull with a real database (full merge + apply flow).
 *
 * Validates:
 * - Happy path: branch entries copied to main changeset; changeset APPLIED; PR status MERGED
 * - Conflict path: concurrent main edit on same entity blocks merge
 * - Empty branch: merge succeeds without creating a main changeset
 */

import type { TestDB } from "@cat/test-utils";

import {
  addChangesetEntry,
  createChangeset,
  createPR,
  createProject,
  createUser,
  executeCommand,
  executeQuery,
  getChangeset,
  getChangesetEntries,
  getPR,
} from "@cat/domain";
import { setupTestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { mergePRFull } from "../merge-pr-full";

// ─── Test State ───────────────────────────────────────────────────────────────

let testDb: TestDB;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

// ─── Helper: create an isolated project for one test ─────────────────────────

async function seedProject(): Promise<{ projectId: string; userId: string }> {
  const newUser = await executeCommand({ db: testDb.client }, createUser, {
    email: `merge-apply-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
    name: "Merge Apply Tester",
  });

  const newProject = await executeCommand(
    { db: testDb.client },
    createProject,
    {
      name: "Merge Apply Test Project",
      description: null,
      creatorId: newUser.id,
    },
  );

  return { projectId: newProject.id, userId: newUser.id };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mergePRFull — integration", () => {
  test("happy path: branch entries copied to main changeset and APPLIED", async () => {
    const { projectId, userId } = await seedProject();

    // Create PR (auto-creates branch with ACTIVE status)
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId,
      title: "Test Merge PR",
      body: "",
      reviewers: [],
      authorId: userId,
    });

    // Create a branch changeset with one entry
    const branchCs = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId,
        branchId: pr.branchId,
        status: "PENDING",
      },
    );

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: branchCs.id,
      entityType: "document",
      entityId: "merge-apply-doc-entity-1",
      action: "CREATE",
      after: { id: "merge-apply-doc-entity-1", name: "Test Document" },
      riskLevel: "LOW",
    });

    // Merge the PR — mergedBy must be a UUID (passed to createChangeset.createdBy)
    const result = await mergePRFull(
      { db: testDb.client },
      { prExternalId: pr.externalId, mergedBy: userId },
    );

    // Verify result shape
    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.mainChangesetId).toBeDefined();

    // Verify PR status = MERGED
    const updatedPr = await executeQuery({ db: testDb.client }, getPR, {
      id: pr.externalId,
    });
    expect(updatedPr?.status).toBe("MERGED");

    // Verify main changeset has the merged entries
    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      {
        changesetId: result.mainChangesetId!,
      },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.entityId).toBe("merge-apply-doc-entity-1");
    expect(entries[0]?.action).toBe("CREATE");

    // Verify applyChangeSet was called — changeset status = APPLIED
    const mainCs = await executeQuery({ db: testDb.client }, getChangeset, {
      changesetId: result.mainChangesetId!,
    });
    expect(mainCs?.status).toBe("APPLIED");
  });

  test("conflict path: concurrent main edit on same entity blocks merge", async () => {
    const { projectId, userId } = await seedProject();

    // 1. Create a main changeset with an entity (before branch creation)
    const mainCs1 = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId,
        status: "APPLIED",
      },
    );

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: mainCs1.id,
      entityType: "document",
      entityId: "conflict-entity-1",
      action: "CREATE",
      after: { id: "conflict-entity-1", name: "Original" },
      riskLevel: "LOW",
    });

    // 2. Create PR → branch.baseChangesetId = mainCs1.id (latest at branch creation)
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId,
      title: "Conflict Test PR",
      body: "",
      reviewers: [],
      authorId: userId,
    });

    // 3. Simulate concurrent main edit on the same entity (after branch forked)
    const mainCs2 = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId,
        status: "APPLIED",
      },
    );

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: mainCs2.id,
      entityType: "document",
      entityId: "conflict-entity-1",
      action: "UPDATE",
      before: { id: "conflict-entity-1", name: "Original" },
      after: { id: "conflict-entity-1", name: "Main Update" },
      riskLevel: "LOW",
    });

    // 4. Branch also edits the same entity
    const branchCs = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId,
        branchId: pr.branchId,
        status: "PENDING",
      },
    );

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: branchCs.id,
      entityType: "document",
      entityId: "conflict-entity-1",
      action: "UPDATE",
      before: { id: "conflict-entity-1", name: "Original" },
      after: { id: "conflict-entity-1", name: "Branch Update" },
      riskLevel: "LOW",
    });

    // 5. Attempt to merge — should detect conflict
    const result = await mergePRFull(
      { db: testDb.client },
      { prExternalId: pr.externalId, mergedBy: userId },
    );

    expect(result.success).toBe(false);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.entityId).toBe("conflict-entity-1");
  });

  test("empty branch: merge succeeds without creating a main changeset", async () => {
    const { projectId, userId } = await seedProject();

    // Create PR with no branch entries
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId,
      title: "Empty Branch PR",
      body: "",
      reviewers: [],
      authorId: userId,
    });

    const result = await mergePRFull(
      { db: testDb.client },
      { prExternalId: pr.externalId, mergedBy: userId },
    );

    // Empty branch → no main changeset created
    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.mainChangesetId).toBeUndefined();
  });
});
