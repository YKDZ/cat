/**
 * Integration tests for mergePRFull with a real database (full merge + apply flow).
 *
 * Validates:
 * - Happy path: branch entries copied to main changeset; changeset APPLIED; PR status MERGED
 * - Conflict path: concurrent main edit on same entity blocks merge
 * - Empty branch: merge succeeds without creating a main changeset
 */

import {
  addChangesetEntry,
  createChangeset,
  createGlossary,
  createGlossaryTerms,
  createPR,
  createProject,
  createUser,
  executeCommand,
  executeQuery,
  ensureLanguages,
  domainEventBus,
  getChangeset,
  getChangesetEntries,
  getBranchById,
  getPR,
  getGlossaryConceptMaterialization,
  reserveGlossaryEntityIds,
  updateGlossaryConcept,
} from "@cat/domain";
import type { TestDB } from "@cat/test-utils";
import { eq, recallDerivationState, setupTestDB, sql } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { mergePRFull } from "../merge-pr-full.ts";

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

async function seedGlossaryMerge(): Promise<{
  projectId: string;
  userId: string;
  prExternalId: string;
  prId: number;
  conceptId: number;
}> {
  const { projectId, userId } = await seedProject();
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en"],
  });
  const glossary = await executeCommand({ db: testDb.client }, createGlossary, {
    name: `Merge event glossary ${crypto.randomUUID()}`,
    creatorId: userId,
    projectIds: [projectId],
  });
  const pr = await executeCommand({ db: testDb.client }, createPR, {
    projectId,
    title: "Merge event glossary",
    body: "",
    reviewers: [],
    authorId: userId,
  });
  const ids = await executeCommand(
    { db: testDb.client },
    reserveGlossaryEntityIds,
    { conceptCount: 1, termCount: 1 },
  );
  const conceptId = ids.conceptIds[0]!;
  const termId = ids.termIds[0]!;
  const branchChangeset = await executeCommand(
    { db: testDb.client },
    createChangeset,
    { projectId, branchId: pr.branchId, status: "PENDING" },
  );
  await executeCommand({ db: testDb.client }, addChangesetEntry, {
    changesetId: branchChangeset.id,
    entityType: "term_concept",
    entityId: String(conceptId),
    action: "CREATE",
    after: {
      concept: {
        id: conceptId,
        glossaryId: glossary.id,
        creatorId: null,
        definition: "merge event",
      },
      terms: [
        {
          id: termId,
          termConceptId: conceptId,
          creatorId: userId,
          text: "merge",
          languageId: "en",
          type: "NOT_SPECIFIED",
          status: "PREFERRED",
        },
      ],
      subjects: [],
    },
    riskLevel: "MEDIUM",
  });
  return {
    projectId,
    userId,
    prExternalId: pr.externalId,
    prId: pr.id,
    conceptId,
  };
}

async function seedStaleGlossaryMerge(): Promise<{
  projectId: string;
  userId: string;
  prExternalId: string;
  branchId: number;
  branchChangesetId: number;
  conceptId: number;
}> {
  const { projectId, userId } = await seedProject();
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const glossary = await executeCommand({ db: testDb.client }, createGlossary, {
    name: `Stale merge glossary ${crypto.randomUUID()}`,
    creatorId: userId,
    projectIds: [projectId],
  });
  const created = await executeCommand(
    { db: testDb.client },
    createGlossaryTerms,
    {
      glossaryId: glossary.id,
      creatorId: userId,
      data: [
        {
          definition: "before",
          term: "source",
          translation: "target",
          termLanguageId: "en",
          translationLanguageId: "zh-Hans",
        },
      ],
    },
  );
  const conceptId = created.conceptIds[0]!;
  const before = await executeQuery(
    { db: testDb.client },
    getGlossaryConceptMaterialization,
    { conceptId },
  );
  if (before === null) throw new Error("Expected canonical concept.");
  const pr = await executeCommand({ db: testDb.client }, createPR, {
    projectId,
    title: "Stale OCC merge",
    body: "",
    reviewers: [],
    authorId: userId,
  });
  const branchChangeset = await executeCommand(
    { db: testDb.client },
    createChangeset,
    {
      projectId,
      branchId: pr.branchId,
      status: "PENDING",
    },
  );
  await executeCommand({ db: testDb.client }, addChangesetEntry, {
    changesetId: branchChangeset.id,
    entityType: "term_concept",
    entityId: String(conceptId),
    action: "UPDATE",
    before,
    after: {
      ...before,
      concept: { ...before.concept, definition: "branch change" },
    },
    riskLevel: "MEDIUM",
  });
  return {
    projectId,
    userId,
    prExternalId: pr.externalId,
    branchId: pr.branchId,
    branchChangesetId: branchChangeset.id,
    conceptId,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mergePRFull — integration", () => {
  test("rolls back merge when a direct writer commits between detection and locked apply", async () => {
    const fixture = await seedStaleGlossaryMerge();
    const [blocker, writer, merger] = await Promise.all([
      testDb.openConcurrentClient(),
      testDb.openConcurrentClient(),
      testDb.openConcurrentClient(),
    ]);
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const hold = blocker.client.transaction(async (tx) => {
      await tx
        .select({ id: recallDerivationState.id })
        .from(recallDerivationState)
        .where(eq(recallDerivationState.targetId, String(fixture.conceptId)))
        .for("update");
      locked();
      await released;
    });
    await lockHeld;
    try {
      const direct = executeCommand(
        { db: writer.client },
        updateGlossaryConcept,
        {
          conceptId: fixture.conceptId,
          definition: "direct winner",
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      const merged = mergePRFull(
        { db: merger.client },
        { prExternalId: fixture.prExternalId, mergedBy: fixture.userId },
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      release();
      await hold;
      await direct;
      const result = await merged;
      expect(result.success).toBe(false);
      await expect(
        executeQuery({ db: testDb.client }, getGlossaryConceptMaterialization, {
          conceptId: fixture.conceptId,
        }),
      ).resolves.toMatchObject({ concept: { definition: "direct winner" } });
      await expect(
        executeQuery({ db: testDb.client }, getPR, {
          id: fixture.prExternalId,
        }),
      ).resolves.toMatchObject({ status: "DRAFT" });
      await expect(
        executeQuery({ db: testDb.client }, getBranchById, {
          branchId: fixture.branchId,
        }),
      ).resolves.toMatchObject({ status: "ACTIVE" });
      await expect(
        executeQuery({ db: testDb.client }, getChangesetEntries, {
          changesetId: fixture.branchChangesetId,
        }),
      ).resolves.toHaveLength(1);
    } finally {
      release();
      await Promise.allSettled([
        hold,
        blocker.cleanup(),
        writer.cleanup(),
        merger.cleanup(),
      ]);
    }
  });

  test("flushes concept and PR events only after the outer merge transaction commits", async () => {
    const fixture = await seedGlossaryMerge();
    const observer = await testDb.openConcurrentClient();
    const conceptVisibility: boolean[] = [];
    const mergedPrIds: number[] = [];
    const unsubscribeConcept = domainEventBus.subscribe(
      "concept:updated",
      async (event) => {
        if (event.payload.conceptId !== fixture.conceptId) return;
        conceptVisibility.push(
          (await executeQuery(
            { db: observer.client },
            getGlossaryConceptMaterialization,
            { conceptId: fixture.conceptId },
          )) !== null,
        );
      },
    );
    const unsubscribePr = domainEventBus.subscribe("pr:merged", (event) => {
      if (event.payload.prId === fixture.prId)
        mergedPrIds.push(event.payload.prId);
    });
    try {
      const result = await mergePRFull(
        { db: testDb.client },
        { prExternalId: fixture.prExternalId, mergedBy: fixture.userId },
      );
      expect(result.success).toBe(true);
      expect(conceptVisibility).toEqual([true]);
      expect(mergedPrIds).toEqual([fixture.prId]);
    } finally {
      unsubscribeConcept();
      unsubscribePr();
      await observer.cleanup();
    }
  });

  test("does not leak concept or PR events when outer merge commit fails after mergePR", async () => {
    const fixture = await seedGlossaryMerge();
    const observedConcepts: number[] = [];
    const observedPrs: number[] = [];
    const unsubscribeConcept = domainEventBus.subscribe(
      "concept:updated",
      (event) => {
        if (event.payload.conceptId === fixture.conceptId)
          observedConcepts.push(event.payload.conceptId);
      },
    );
    const unsubscribePr = domainEventBus.subscribe("pr:merged", (event) => {
      if (event.payload.prId === fixture.prId)
        observedPrs.push(event.payload.prId);
    });
    let triggerInstalled = false;
    await testDb.client.execute(sql`
      CREATE FUNCTION reject_pr_merge_commit() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'reject merge commit';
      END;
      $$ LANGUAGE plpgsql;
      CREATE CONSTRAINT TRIGGER reject_pr_merge_commit
      AFTER UPDATE ON "PullRequest"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION reject_pr_merge_commit();
    `);
    triggerInstalled = true;
    try {
      await expect(
        mergePRFull(
          { db: testDb.client },
          { prExternalId: fixture.prExternalId, mergedBy: fixture.userId },
        ),
      ).rejects.toBeDefined();
      expect(observedConcepts).toEqual([]);
      expect(observedPrs).toEqual([]);
      await expect(
        executeQuery({ db: testDb.client }, getGlossaryConceptMaterialization, {
          conceptId: fixture.conceptId,
        }),
      ).resolves.toBeNull();
      await expect(
        executeQuery({ db: testDb.client }, getPR, {
          id: fixture.prExternalId,
        }),
      ).resolves.toMatchObject({ status: "DRAFT" });
    } finally {
      unsubscribeConcept();
      unsubscribePr();
      if (triggerInstalled) {
        await testDb.client.execute(sql`
          DROP TRIGGER IF EXISTS reject_pr_merge_commit ON "PullRequest";
          DROP FUNCTION IF EXISTS reject_pr_merge_commit();
        `);
      }
    }
  });

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
      entityType: "content_node",
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
      entityType: "content_node",
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
      entityType: "content_node",
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
      entityType: "content_node",
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

  test("failed entry application leaves the changeset, PR, and branch unmerged", async () => {
    const { projectId, userId } = await seedProject();
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId,
      title: "Invalid translation payload",
      body: "",
      reviewers: [],
      authorId: userId,
    });
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, branchId: pr.branchId, status: "PENDING" },
    );

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: branchChangeset.id,
      entityType: "translation",
      entityId: `translation:${crypto.randomUUID()}`,
      action: "CREATE",
      after: { text: "missing element and language" },
      riskLevel: "LOW",
    });

    const result = await mergePRFull(
      { db: testDb.client },
      { prExternalId: pr.externalId, mergedBy: userId },
    );

    expect(result).toMatchObject({
      success: false,
      hasConflicts: false,
      errorMessage: expect.stringContaining("Invalid translation payload"),
    });
    await expect(
      executeQuery({ db: testDb.client }, getPR, { id: pr.externalId }),
    ).resolves.toMatchObject({ status: "DRAFT" });
    await expect(
      executeQuery({ db: testDb.client }, getBranchById, {
        branchId: pr.branchId,
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(
      executeQuery({ db: testDb.client }, getChangeset, {
        changesetId: branchChangeset.id,
      }),
    ).resolves.toMatchObject({ status: "PENDING" });
  });
});
