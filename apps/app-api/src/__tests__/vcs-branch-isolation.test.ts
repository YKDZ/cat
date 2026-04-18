/**
 * @zh VCS 分支隔离集成测试 — 真实数据库。
 * @en VCS branch isolation integration tests with a real database.
 *
 * Validates:
 * - VCSMiddleware.interceptWrite in isolation mode records to branch changeset without executing writeFn
 * - listWithOverlay returns branch entries overlaid on main items
 * - listWithOverlay without branchId returns only main items (no overlay)
 * - withBranchContext: invalid branchId → NOT_FOUND; non-ACTIVE branch → CONFLICT
 */

import type { TestDB } from "@cat/test-utils";

import {
  addChangesetEntry,
  createBranch,
  createChangeset,
  createPR,
  createProject,
  createUser,
  executeCommand,
  executeQuery,
  getChangesetEntries,
  listBranchChangesetEntries,
  mergePR,
  updateBranchBaseChangeset,
} from "@cat/domain";
import { setupTestDB } from "@cat/test-utils";
import {
  getBranchChangesetId,
  getDefaultRegistries,
  listWithOverlay,
  rebaseBranch,
} from "@cat/vcs";
import { ORPCError } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

// ─── Mock @cat/permissions ────────────────────────────────────────────────────

vi.mock("@cat/permissions", () => ({
  getPermissionEngine: () => ({
    check: async () => true,
  }),
  determineWriteMode: async () => "direct",
}));

// ─── Test State ───────────────────────────────────────────────────────────────

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedProject() {
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `vcs-iso-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
    name: "VCS Isolation Tester",
  });
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: "VCS Isolation Test Project",
    description: null,
    creatorId: user.id,
  });
  return { userId: user.id, projectId: project.id };
}

type MockItem = { id: string; name: string };

// ─── invoke withBranchContext as a callable (same cast pattern as unit tests) ─

type BranchContextInput = { branchId?: number; projectId?: string };

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const invokeWithBranchContext = withBranchContext as unknown as (
  options: {
    context: {
      user: {
        id: string;
        email: string;
        name: string;
        emailVerified: boolean;
        avatarFileId: null;
        createdAt: Date;
        updatedAt: Date;
      };
      sessionId: string | null;
      auth: {
        subjectType: "user";
        subjectId: string;
        systemRoles: string[];
        scopes: string[] | null;
      };
      drizzleDB: { client: typeof testDb.client };
    };
    next: () => Promise<{
      output: undefined;
      context: Record<string, unknown>;
    }>;
    errors: Record<string, never>;
    path: never[];
    signal: undefined;
  },
  input: BranchContextInput,
  outputFn: () => void,
) => Promise<unknown>;

function makeTestAuthContext(userId: string, db: typeof testDb.client) {
  return {
    user: {
      id: userId,
      email: "test@example.com",
      name: "Test User",
      emailVerified: true as const,
      avatarFileId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    sessionId: "session-1" as string | null,
    auth: {
      subjectType: "user" as const,
      subjectId: userId,
      systemRoles: [] as string[],
      scopes: null as string[] | null,
    },
    drizzleDB: { client: db },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("VCS branch isolation — integration", () => {
  test("interceptWrite in isolation mode records to branch changeset without calling writeFn", async () => {
    const { projectId, userId } = await seedProject();

    // Create PR (auto-creates branch)
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId,
      title: "Isolation Test PR",
      body: "",
      reviewers: [],
      authorId: userId,
    });

    // Create branch changeset so branchChangesetId is available
    const branchCs = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId,
        branchId: pr.branchId,
        status: "PENDING",
      },
    );

    const { middleware } = createVCSRouteHelper(testDb.client);

    const writeFnSpy = vi.fn().mockResolvedValue({});

    await middleware.interceptWrite(
      {
        mode: "isolation",
        projectId,
        branchId: pr.branchId,
        branchChangesetId: branchCs.id,
      },
      "translation",
      "trans-entity-001",
      "CREATE",
      null,
      { id: "trans-entity-001", content: "Hello" },
      writeFnSpy,
    );

    // writeFn must NOT be called in isolation mode
    expect(writeFnSpy).not.toHaveBeenCalled();

    // Branch changeset must contain the entry
    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      {
        changesetId: branchCs.id,
      },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.entityId).toBe("trans-entity-001");
    expect(entries[0]?.action).toBe("CREATE");
  });

  test("listWithOverlay returns branch CREATE entry overlaid on empty main list", async () => {
    const { projectId, userId } = await seedProject();

    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId,
      title: "Overlay Test PR",
      body: "",
      reviewers: [],
      authorId: userId,
    });

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
      entityType: "translation",
      entityId: "overlay-entity-001",
      action: "CREATE",
      after: { id: "overlay-entity-001", content: "Branch translation" },
      riskLevel: "LOW",
    });

    // With branchId: overlay should show the branch entry
    const withBranch = await listWithOverlay<MockItem>(
      testDb.client,
      pr.branchId,
      "translation",
      [] as MockItem[],
      (item) => item.id,
    );
    expect(withBranch).toHaveLength(1);
    expect(withBranch[0]?.id).toBe("overlay-entity-001");
  });

  test("listWithOverlay with empty branch (no changeset entries) returns main items unchanged", async () => {
    const mainItems: MockItem[] = [
      { id: "main-entity-1", name: "Main Item 1" },
      { id: "main-entity-2", name: "Main Item 2" },
    ];

    // To test without overlay: call with a dummy branchId that has no entries
    // In practice, "no branchId" means callers use main path without listWithOverlay.
    // Here we verify: branchId with no changeset entries returns mainItems unchanged.
    const { projectId, userId } = await seedProject();
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId,
      title: "Empty Branch Overlay PR",
      body: "",
      reviewers: [],
      authorId: userId,
    });

    // Branch has no changeset → getBranchChangesetId returns null
    const csId = await getBranchChangesetId(testDb.client, pr.branchId);
    expect(csId).toBeNull();

    // listWithOverlay with no branch entries → returns mainItems unchanged
    const result = await listWithOverlay<MockItem>(
      testDb.client,
      pr.branchId,
      "translation",
      mainItems,
      (item) => item.id,
    );
    expect(result).toHaveLength(2);
    expect(result).toEqual(mainItems);
  });

  test("withBranchContext: invalid branchId → NOT_FOUND", async () => {
    const { userId } = await seedProject();
    const ctx = makeTestAuthContext(userId, testDb.client);
    const next = vi.fn().mockResolvedValue({ output: undefined, context: {} });

    try {
      await invokeWithBranchContext(
        { context: ctx, next, errors: {}, path: [], signal: undefined },
        { branchId: 999_999_999 },
        vi.fn(),
      );
      expect.fail("Expected ORPCError NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      if (err instanceof ORPCError) {
        expect(err.code).toBe("NOT_FOUND");
      }
    }
  });

  test("withBranchContext: non-ACTIVE branch → CONFLICT", async () => {
    const { projectId, userId } = await seedProject();

    // Create PR (creates ACTIVE branch), then merge PR to make branch MERGED
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId,
      title: "Merged Branch Context Test PR",
      body: "",
      reviewers: [],
      authorId: userId,
    });

    // Mark PR as MERGED (and branch as MERGED) via mergePR domain command
    await executeCommand({ db: testDb.client }, mergePR, {
      prId: pr.id,
      mergedBy: `user:${userId}`,
    });

    const ctx = makeTestAuthContext(userId, testDb.client);
    const next = vi.fn().mockResolvedValue({ output: undefined, context: {} });

    try {
      await invokeWithBranchContext(
        { context: ctx, next, errors: {}, path: [], signal: undefined },
        { branchId: pr.branchId },
        vi.fn(),
      );
      expect.fail("Expected ORPCError CONFLICT");
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      if (err instanceof ORPCError) {
        expect(err.code).toBe("CONFLICT");
      }
    }
  });
});

// ─── Direct mode — route integration ─────────────────────────────────────────

describe("Direct mode — route integration", () => {
  test("interceptWrite in direct mode calls writeFn and records changeset entry", async () => {
    const { projectId, userId } = await seedProject();

    const { csService, middleware } = createVCSRouteHelper(testDb.client);
    const writeFnSpy = vi.fn().mockResolvedValue({ id: "direct-entity-001" });

    await middleware.interceptWrite(
      {
        mode: "direct",
        projectId,
        createdBy: userId,
      },
      "comment",
      "direct-entity-001",
      "CREATE",
      null,
      { id: "direct-entity-001", content: "Direct mode comment" },
      writeFnSpy,
    );

    // writeFn MUST be called in direct mode
    expect(writeFnSpy).toHaveBeenCalledOnce();

    // A main changeset must have been lazily created for this project
    const changesets = await csService.listChangeSets(projectId);
    expect(changesets.length).toBeGreaterThan(0);
    const directCs = changesets[0];
    if (directCs === undefined)
      throw new Error("Expected at least one changeset");

    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      { changesetId: directCs.id },
    );
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries.find((e) => e.entityId === "direct-entity-001");
    expect(entry).toBeDefined();
    expect(entry?.action).toBe("CREATE");
    expect(entry?.entityType).toBe("comment");
  });

  test("direct mode — no interceptWrite call means no changeset created (lazy creation)", async () => {
    const { projectId } = await seedProject();

    const { csService } = createVCSRouteHelper(testDb.client);
    const changesets = await csService.listChangeSets(projectId);

    // No changeset should exist for this brand-new project
    expect(changesets).toHaveLength(0);
  });
});

describe("Rebase before-rewrite", () => {
  let testDb2: TestDB;

  beforeAll(async () => {
    testDb2 = await setupTestDB();
  });

  afterAll(async () => {
    await testDb2?.cleanup();
  });

  test("UPDATE entry before-value is unchanged when no fetcher is wired (safe no-op)", async () => {
    const user = await executeCommand({ db: testDb2.client }, createUser, {
      email: `rebase-before-${Date.now()}@test.local`,
      name: "Rebase Tester",
    });
    const project = await executeCommand(
      { db: testDb2.client },
      createProject,
      { name: "Rebase Before Test", description: null, creatorId: user.id },
    );
    const { id: projectId } = project;

    // 1. Create initial main changeset with entity at version v1
    const mainCs = await executeCommand(
      { db: testDb2.client },
      createChangeset,
      { projectId, status: "APPLIED" },
    );
    await executeCommand({ db: testDb2.client }, addChangesetEntry, {
      changesetId: mainCs.id,
      entityType: "document",
      entityId: "rewrite-entity-1",
      action: "CREATE",
      after: { id: "rewrite-entity-1", text: "hello_v1" },
      riskLevel: "LOW",
    });

    // 2. Create branch based on mainCs
    const branch = await executeCommand({ db: testDb2.client }, createBranch, {
      projectId,
      name: "rewrite-branch-1",
    });
    await executeCommand({ db: testDb2.client }, updateBranchBaseChangeset, {
      branchId: branch.id,
      baseChangesetId: mainCs.id,
    });

    // 3. Add an UPDATE entry to the branch (before = v1 snapshot)
    const branchCs = await executeCommand(
      { db: testDb2.client },
      createChangeset,
      { projectId, branchId: branch.id, status: "PENDING" },
    );
    await executeCommand({ db: testDb2.client }, addChangesetEntry, {
      changesetId: branchCs.id,
      entityType: "document",
      entityId: "rewrite-entity-1",
      action: "UPDATE",
      before: { id: "rewrite-entity-1", text: "hello_v1" },
      after: { id: "rewrite-entity-1", text: "branch_edit" },
      riskLevel: "LOW",
    });

    // 4. Main advances — update same entity on main to v2
    const mainCs2 = await executeCommand(
      { db: testDb2.client },
      createChangeset,
      { projectId, status: "APPLIED" },
    );
    await executeCommand({ db: testDb2.client }, addChangesetEntry, {
      changesetId: mainCs2.id,
      entityType: "document",
      entityId: "rewrite-entity-1",
      action: "UPDATE",
      before: { id: "rewrite-entity-1", text: "hello_v1" },
      after: { id: "rewrite-entity-1", text: "hello_v2" },
      riskLevel: "LOW",
    });

    // 5. Rebase without wired fetchers (no-fetcher fallback: before becomes null)
    const { appMethodRegistry } = getDefaultRegistries();
    const result = await rebaseBranch(
      testDb2.client,
      branch.id,
      appMethodRegistry,
    );

    expect(result.success).toBe(true);
    expect(result.newBaseChangesetId).toBe(mainCs2.id);

    // 6. Verify: branch UPDATE entry's before is unchanged (no-op without fetcher)
    const entries = await executeQuery(
      { db: testDb2.client },
      listBranchChangesetEntries,
      { branchId: branch.id },
    );
    const updateEntry = entries.find((e) => e.action === "UPDATE");
    expect(updateEntry).toBeDefined();
    // Without wired fetchers, rebase is a safe no-op: before value is preserved
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    expect((updateEntry!.before as Record<string, unknown>)?.["text"]).toBe(
      "hello_v1",
    );
  });

  test("CREATE entries are not rewritten (before remains null) during rebase", async () => {
    const user = await executeCommand({ db: testDb2.client }, createUser, {
      email: `rebase-create-${Date.now()}@test.local`,
      name: "Rebase Create Tester",
    });
    const project = await executeCommand(
      { db: testDb2.client },
      createProject,
      {
        name: "Rebase Create Test",
        description: null,
        creatorId: user.id,
      },
    );
    const { id: projectId } = project;

    // 1. Create initial main changeset
    const mainCs = await executeCommand(
      { db: testDb2.client },
      createChangeset,
      { projectId, status: "APPLIED" },
    );

    // 2. Create branch based on mainCs
    const branch = await executeCommand({ db: testDb2.client }, createBranch, {
      projectId,
      name: "rewrite-branch-create-1",
    });
    await executeCommand({ db: testDb2.client }, updateBranchBaseChangeset, {
      branchId: branch.id,
      baseChangesetId: mainCs.id,
    });

    // 3. Add a CREATE entry to the branch (before = null)
    const branchCs = await executeCommand(
      { db: testDb2.client },
      createChangeset,
      { projectId, branchId: branch.id, status: "PENDING" },
    );
    await executeCommand({ db: testDb2.client }, addChangesetEntry, {
      changesetId: branchCs.id,
      entityType: "document",
      entityId: "new-entity-branch",
      action: "CREATE",
      after: { id: "new-entity-branch", text: "brand new" },
      riskLevel: "LOW",
    });

    // 4. Main advances
    const mainCs2 = await executeCommand(
      { db: testDb2.client },
      createChangeset,
      { projectId, status: "APPLIED" },
    );
    await executeCommand({ db: testDb2.client }, addChangesetEntry, {
      changesetId: mainCs2.id,
      entityType: "document",
      entityId: "other-entity",
      action: "CREATE",
      after: { id: "other-entity", text: "main item" },
      riskLevel: "LOW",
    });

    // 5. Rebase
    const { appMethodRegistry } = getDefaultRegistries();
    await rebaseBranch(testDb2.client, branch.id, appMethodRegistry);

    // 6. Verify: CREATE entry's before remains null (not touched by rewrite)
    const entries = await executeQuery(
      { db: testDb2.client },
      listBranchChangesetEntries,
      { branchId: branch.id },
    );
    const createEntry = entries.find((e) => e.action === "CREATE");
    expect(createEntry).toBeDefined();
    expect(createEntry!.before).toBeNull();
  });
});
