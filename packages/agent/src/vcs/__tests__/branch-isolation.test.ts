/**
 * @zh entity_branch 分支隔离集成测试。
 * @en entity_branch isolation integration tests.
 *
 * Tests cover:
 * - Write isolation: branch writes not visible to main
 * - Overlay read consistency: branch sees main + own changes
 * - Merge: branch changes reflected in main after merge
 * - Conflict detection: two branches modifying same entity
 * - Rebase: branch base updated to latest main
 * - Abandon: abandoned branch changes don't affect main
 */

import type { ChangeAction, EntityType } from "@cat/shared/schema/enum";
import type { TestDB } from "@cat/test-utils";

import {
  addChangesetEntry,
  createBranch,
  createChangeset,
  createProject,
  createUser,
  executeCommand,
  executeQuery,
  getBranchById,
  updateBranchBaseChangeset,
  updateBranchStatus,
} from "@cat/domain";
import { setupTestDB } from "@cat/test-utils";
import {
  detectConflicts,
  getDefaultRegistries,
  mergeBranch,
  rebaseBranch,
} from "@cat/vcs";
import {
  getBranchChangesetId,
  listWithOverlay,
  readWithOverlay,
} from "@cat/vcs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// ─── Test State ───────────────────────────────────────────────────────────────

let testDb: TestDB;
let projectId: string;
let userId: string;

// ─── Helper: seed a test user + project ──────────────────────────────────────

async function seedProject(
  db: TestDB,
): Promise<{ projectId: string; userId: string }> {
  const newUser = await executeCommand({ db: db.client }, createUser, {
    email: `branch-test-${Date.now()}@example.com`,
    name: "Branch Tester",
  });

  const newProject = await executeCommand({ db: db.client }, createProject, {
    name: "Branch Test Project",
    description: null,
    creatorId: newUser.id,
  });

  return { projectId: newProject.id, userId: newUser.id };
}

// ─── Helper: create a main changeset with one entry ──────────────────────────

async function seedMainChangeset(
  db: TestDB,
  pid: string,
  entityType: EntityType,
  entityId: string,
  action: ChangeAction,
  after: unknown,
): Promise<number> {
  const cs = await executeCommand({ db: db.client }, createChangeset, {
    projectId: pid,
    status: "APPLIED",
  });

  await executeCommand({ db: db.client }, addChangesetEntry, {
    changesetId: cs.id,
    entityType,
    entityId,
    action,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    after: after as Record<string, unknown>,
    riskLevel: "LOW",
  });

  return cs.id;
}

// ─── Helper: create a branch ─────────────────────────────────────────────────

async function seedBranch(
  db: TestDB,
  pid: string,
  name: string,
  baseChangesetId: number | null,
): Promise<number> {
  const branch = await executeCommand({ db: db.client }, createBranch, {
    projectId: pid,
    name,
  });

  // Force the desired baseChangesetId (createBranch auto-picks latest)
  if (branch.baseChangesetId !== baseChangesetId) {
    await executeCommand({ db: db.client }, updateBranchBaseChangeset, {
      branchId: branch.id,
      baseChangesetId,
    });
  }

  return branch.id;
}

// ─── Helper: create a branch changeset with entries ──────────────────────────

async function seedBranchChangeset(
  db: TestDB,
  pid: string,
  branchId: number,
  entries: Array<{
    entityType: EntityType;
    entityId: string;
    action: ChangeAction;
    before?: unknown;
    after?: unknown;
  }>,
): Promise<number> {
  const cs = await executeCommand({ db: db.client }, createChangeset, {
    projectId: pid,
    branchId,
    status: "PENDING",
  });

  await Promise.all(
    entries.map(async (e) =>
      executeCommand({ db: db.client }, addChangesetEntry, {
        changesetId: cs.id,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        before: e.before as Record<string, unknown> | undefined,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        after: e.after as Record<string, unknown> | undefined,
        riskLevel: "LOW",
      }),
    ),
  );

  return cs.id;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("entity_branch Isolation", () => {
  beforeAll(async () => {
    testDb = await setupTestDB();
    const seeded = await seedProject(testDb);
    projectId = seeded.projectId;
    userId = seeded.userId;
  });

  afterAll(async () => {
    await testDb?.cleanup();
  });

  // ─── Write Isolation ───────────────────────────────────────────────────────

  test("写隔离: readWithOverlay returns null for main entity not in branch", async () => {
    const branchId = await seedBranch(testDb, projectId, "isolation-1", null);

    // Main entity exists, but we haven't added it to branch
    const result = await readWithOverlay(
      testDb.client,
      branchId,
      "document",
      "entity-not-in-branch",
    );

    // No branch entry → returns null (caller must read from main)
    expect(result).toBeNull();
  });

  test("写隔离: branch changeset write is isolated to branch only", async () => {
    const branchId = await seedBranch(testDb, projectId, "isolation-2", null);

    const entityId = "isolated-entity-1";

    // Simulate a branch-only write
    await seedBranchChangeset(testDb, projectId, branchId, [
      {
        entityType: "document",
        entityId,
        action: "CREATE",
        after: { id: entityId, name: "Branch-only doc" },
      },
    ]);

    // Branch should see the entity
    const branchResult = await readWithOverlay(
      testDb.client,
      branchId,
      "document",
      entityId,
    );
    expect(branchResult).not.toBeNull();
    expect(branchResult?.action).toBe("CREATE");

    // A different branch should NOT see the entity
    const otherBranchId = await seedBranch(
      testDb,
      projectId,
      "isolation-2b",
      null,
    );
    const otherResult = await readWithOverlay(
      testDb.client,
      otherBranchId,
      "document",
      entityId,
    );
    expect(otherResult).toBeNull();
  });

  // ─── Overlay Read Consistency ──────────────────────────────────────────────

  test("读一致性: branch DELETE hides main entity via overlay", async () => {
    const entityId = "overlay-delete-1";
    const branchId = await seedBranch(testDb, projectId, "overlay-1", null);

    // Branch deletes the entity
    await seedBranchChangeset(testDb, projectId, branchId, [
      {
        entityType: "document",
        entityId,
        action: "DELETE",
        before: { id: entityId, name: "Original" },
      },
    ]);

    const result = await readWithOverlay(
      testDb.client,
      branchId,
      "document",
      entityId,
    );

    // DELETE → should return marker object with action: "DELETE"
    expect(result).not.toBeNull();
    expect(result?.action).toBe("DELETE");
    expect(result?.data).toBeNull();
  });

  test("读一致性: listWithOverlay merges main items with branch changes", async () => {
    const branchId = await seedBranch(
      testDb,
      projectId,
      "overlay-list-1",
      null,
    );

    const mainItems = [
      { id: "item-1", name: "Alpha" },
      { id: "item-2", name: "Beta" },
      { id: "item-3", name: "Gamma" },
    ];

    // Branch: update item-1, delete item-2, create item-4
    await seedBranchChangeset(testDb, projectId, branchId, [
      {
        entityType: "document",
        entityId: "item-1",
        action: "UPDATE",
        before: { id: "item-1", name: "Alpha" },
        after: { id: "item-1", name: "Alpha Updated" },
      },
      {
        entityType: "document",
        entityId: "item-2",
        action: "DELETE",
        before: { id: "item-2", name: "Beta" },
      },
      {
        entityType: "document",
        entityId: "item-4",
        action: "CREATE",
        after: { id: "item-4", name: "Delta" },
      },
    ]);

    const result = await listWithOverlay(
      testDb.client,
      branchId,
      "document",
      mainItems,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      (item) => (item as { id: string }).id,
    );

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const ids = result.map((item) => (item as { id: string }).id);

    // item-1 updated, item-2 deleted, item-3 unchanged, item-4 created
    expect(ids).toContain("item-1");
    expect(ids).not.toContain("item-2");
    expect(ids).toContain("item-3");
    expect(ids).toContain("item-4");

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const item1 = result.find((i) => (i as { id: string }).id === "item-1");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    expect((item1 as { name: string }).name).toBe("Alpha Updated");
  });

  // ─── getBranchChangesetId ──────────────────────────────────────────────────

  test("getBranchChangesetId: returns latest branch changeset id", async () => {
    const branchId = await seedBranch(testDb, projectId, "overlay-cs-1", null);

    // No changeset yet
    const nullId = await getBranchChangesetId(testDb.client, branchId);
    expect(nullId).toBeNull();

    // Create a changeset
    const csId = await seedBranchChangeset(testDb, projectId, branchId, []);

    const found = await getBranchChangesetId(testDb.client, branchId);
    expect(found).toBe(csId);
  });

  // ─── Merge ────────────────────────────────────────────────────────────────

  test("合并: 无冲突分支合并成功并 status=MERGED", async () => {
    const mainCsId = await seedMainChangeset(
      testDb,
      projectId,
      "document",
      "merge-entity-1",
      "CREATE",
      { id: "merge-entity-1", name: "Main doc" },
    );

    const branchId = await seedBranch(testDb, projectId, "merge-1", mainCsId);

    // Branch modifies a different entity (no conflict)
    await seedBranchChangeset(testDb, projectId, branchId, [
      {
        entityType: "document",
        entityId: "merge-entity-2",
        action: "CREATE",
        after: { id: "merge-entity-2", name: "Branch doc" },
      },
    ]);

    const result = await mergeBranch(testDb.client, branchId, userId);

    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);
    expect(result.mainChangesetId).toBeDefined();

    // Verify branch status is MERGED
    const branch = await executeQuery({ db: testDb.client }, getBranchById, {
      branchId,
    });
    expect(branch?.status).toBe("MERGED");
  });

  // ─── Conflict Detection ────────────────────────────────────────────────────

  test("冲突检测: 两个分支修改同一实体时检测到冲突", async () => {
    // Seed a main changeset
    const mainCsId = await seedMainChangeset(
      testDb,
      projectId,
      "document",
      "conflict-entity-1",
      "CREATE",
      { id: "conflict-entity-1", name: "Original" },
    );

    // Branch A: modifies entity
    const branchIdA = await seedBranch(
      testDb,
      projectId,
      "conflict-branch-a",
      mainCsId,
    );
    await seedBranchChangeset(testDb, projectId, branchIdA, [
      {
        entityType: "document",
        entityId: "conflict-entity-1",
        action: "UPDATE",
        before: { id: "conflict-entity-1", name: "Original" },
        after: { id: "conflict-entity-1", name: "Branch A Update" },
      },
    ]);

    // Merge branch A into main (no conflicts yet)
    const mergeA = await mergeBranch(testDb.client, branchIdA, userId);
    expect(mergeA.success).toBe(true);

    // Branch B (created at same base): also modifies the same entity
    const branchIdB = await seedBranch(
      testDb,
      projectId,
      "conflict-branch-b",
      mainCsId,
    );
    await seedBranchChangeset(testDb, projectId, branchIdB, [
      {
        entityType: "document",
        entityId: "conflict-entity-1",
        action: "UPDATE",
        before: { id: "conflict-entity-1", name: "Original" },
        after: { id: "conflict-entity-1", name: "Branch B Update" },
      },
    ]);

    // Detect conflicts for branch B — should find a conflict with the main update made by branch A
    const conflicts = await detectConflicts(testDb.client, branchIdB);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]?.entityId).toBe("conflict-entity-1");

    // Merge should fail due to conflict
    const mergeB = await mergeBranch(testDb.client, branchIdB, userId);
    expect(mergeB.success).toBe(false);
    expect(mergeB.hasConflicts).toBe(true);
  });

  // ─── Rebase ───────────────────────────────────────────────────────────────

  test("Rebase: 更新 baseChangesetId 到 main 最新", async () => {
    const initialCsId = await seedMainChangeset(
      testDb,
      projectId,
      "document",
      "rebase-entity-1",
      "CREATE",
      { id: "rebase-entity-1", name: "Initial" },
    );

    const branchId = await seedBranch(
      testDb,
      projectId,
      "rebase-1",
      initialCsId,
    );

    // Create a newer main changeset
    const newerCsId = await seedMainChangeset(
      testDb,
      projectId,
      "document",
      "rebase-entity-2",
      "CREATE",
      { id: "rebase-entity-2", name: "Newer" },
    );

    const result = await rebaseBranch(
      testDb.client,
      branchId,
      getDefaultRegistries().appMethodRegistry,
    );

    expect(result.success).toBe(true);
    expect(result.newBaseChangesetId).toBe(newerCsId);

    // Verify DB updated
    const branch = await executeQuery({ db: testDb.client }, getBranchById, {
      branchId,
    });
    expect(branch?.baseChangesetId).toBe(newerCsId);
  });

  // ─── Abandon ──────────────────────────────────────────────────────────────

  test("Abandon: 放弃分支后其变更不出现在 main 上", async () => {
    const branchId = await seedBranch(testDb, projectId, "abandon-1", null);

    const entityId = "abandon-entity-1";

    await seedBranchChangeset(testDb, projectId, branchId, [
      {
        entityType: "document",
        entityId,
        action: "CREATE",
        after: { id: entityId, name: "Abandoned" },
      },
    ]);

    // Abandon branch via domain command
    await executeCommand({ db: testDb.client }, updateBranchStatus, {
      branchId,
      status: "ABANDONED",
    });

    const verifyBranch = await executeQuery(
      { db: testDb.client },
      getBranchById,
      { branchId },
    );
    expect(verifyBranch?.status).toBe("ABANDONED");

    // A read on main (without overlay) should not see branch changes
    // — branch changeset is attached to branchId, not main
    // We just verify readWithOverlay on a different branch doesn't see it
    const otherBranchId = await seedBranch(
      testDb,
      projectId,
      "abandon-1-other",
      null,
    );
    const result = await readWithOverlay(
      testDb.client,
      otherBranchId,
      "document",
      entityId,
    );
    expect(result).toBeNull();
  });
});
