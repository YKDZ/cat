import {
  addChangesetEntry,
  appendChangesetEntriesIfUnchanged,
  createBranch,
  createChangeset,
  createElements,
  createGlossary,
  createGlossaryTerms,
  domainEventBus,
  createMemory,
  createMemoryItems,
  createProject,
  createRootContentNode,
  createUser,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  ensurePersonalProjectMemory,
  executeCommand,
  executeQuery,
  getChangeset,
  getChangesetEntries,
  getGlossaryConceptMaterialization,
  getMemoryCanonicalSnapshots,
  getRecallDerivationStates,
  listGlossaryConcepts,
  listTranslationsByElement,
  reserveGlossaryEntityIds,
  updateGlossaryConcept,
} from "@cat/domain";
import { assertFirstNonNullish, NormalizedLanguageIdSchema } from "@cat/shared";
import type { TestDB } from "@cat/test-utils";
import {
  eq,
  entityBranch,
  memoryItem,
  recallDerivationState,
  setupTestDB,
} from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mergeBranch, rebaseBranch } from "./branch-merge.ts";
import {
  ChangeSetApplicationError,
  ChangeSetService,
} from "./changeset-service.ts";
import { getDefaultRegistries } from "./index.ts";
import { MemoryItemApplicationMethod } from "./methods/memory-item-application-method.ts";

let testDb: TestDB;
const enLanguageId = NormalizedLanguageIdSchema.parse("en");
const zhHansLanguageId = NormalizedLanguageIdSchema.parse("zh-Hans");

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

const seedTranslationTarget = async (): Promise<{
  elementId: number;
  projectId: string;
  userId: string;
}> => {
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `vcs-changeset-${crypto.randomUUID()}@test.local`,
    name: "VCS changeset tester",
  });
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: "VCS changeset test project",
    description: null,
    creatorId: user.id,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: project.id, creatorId: user.id },
  );
  const stringIds = await executeCommand(
    { db: testDb.client },
    createVectorizedStrings,
    { data: [{ text: "Source", languageId: "en" }] },
  );
  const elementIds = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: root.id,
          importerId: "vcs-test",
          sourceRootRef: `project:${project.id}`,
          sourceNodeRef: "vcs-test#0",
          stableSourceRef: `vcs-test#${crypto.randomUUID()}`,
          stringId: assertFirstNonNullish(stringIds),
          creatorId: user.id,
        },
      ],
    },
  );
  return {
    elementId: assertFirstNonNullish(elementIds),
    projectId: project.id,
    userId: user.id,
  };
};

const createService = (): ChangeSetService => {
  const { diffRegistry, appMethodRegistry } = getDefaultRegistries();
  return new ChangeSetService(testDb.client, diffRegistry, appMethodRegistry);
};

const appendLifecycleEntry = async (
  db: TestDB["client"],
  changesetId: number,
  entityId: string,
) =>
  await executeCommand({ db }, appendChangesetEntriesIfUnchanged, {
    changesetId,
    expectedLatestEntryId: null,
    entries: [
      {
        entityType: "term_concept",
        entityId,
        action: "CREATE",
        before: null,
        after: { concept: { id: Number(entityId) } },
        fieldPath: null,
        riskLevel: "MEDIUM",
      },
    ],
  });

const holdBranchRow = async (branchId: number) => {
  const blocker = await testDb.openConcurrentClient();
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked!: () => void;
  const lockHeld = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const holding = blocker.client.transaction(async (tx) => {
    await tx
      .select({ id: entityBranch.id })
      .from(entityBranch)
      .where(eq(entityBranch.id, branchId))
      .for("update");
    locked();
    await released;
  });
  await lockHeld;
  return {
    release: async () => {
      release();
      await holding;
      await blocker.cleanup();
    },
  };
};

describe("ChangeSetService database application", () => {
  it("detects main conflicts for a branch created before any main changeset", async () => {
    const { projectId, userId } = await seedTranslationTarget();
    const branch = await executeCommand({ db: testDb.client }, createBranch, {
      projectId,
      name: `null-base-${crypto.randomUUID()}`,
      createdBy: userId,
    });
    expect(branch.baseChangesetId).toBeNull();
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, branchId: branch.id, status: "PENDING" },
    );
    const mainChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPLIED" },
    );
    for (const changesetId of [branchChangeset.id, mainChangeset.id]) {
      await executeCommand({ db: testDb.client }, addChangesetEntry, {
        changesetId,
        entityType: "term_concept",
        entityId: "null-base-concept",
        action: "UPDATE",
        before: { revision: 1 },
        after: { revision: changesetId },
        riskLevel: "MEDIUM",
      });
    }
    const merged = await mergeBranch(testDb.client, branch.id, userId);
    expect(merged).toMatchObject({ success: false, hasConflicts: true });
    expect(merged.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "null-base-concept" }),
      ]),
    );
  });

  it("buffers glossary events until a mixed changeset commits", async () => {
    const { projectId, userId } = await seedTranslationTarget();
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Event commit glossary ${crypto.randomUUID()}`,
        creatorId: userId,
        projectIds: [projectId],
      },
    );
    const ids = await executeCommand(
      { db: testDb.client },
      reserveGlossaryEntityIds,
      { conceptCount: 1, termCount: 1 },
    );
    const conceptId = assertFirstNonNullish(ids.conceptIds);
    const termId = assertFirstNonNullish(ids.termIds);
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "term_concept",
      entityId: String(conceptId),
      action: "CREATE",
      after: {
        concept: {
          id: conceptId,
          glossaryId: glossary.id,
          creatorId: null,
          definition: "event commit",
        },
        terms: [
          {
            id: termId,
            termConceptId: conceptId,
            creatorId: userId,
            text: "event",
            languageId: "en",
            type: "NOT_SPECIFIED",
            status: "PREFERRED",
          },
        ],
        subjects: [],
      },
      riskLevel: "MEDIUM",
    });
    const observer = await testDb.openConcurrentClient();
    const visibility: boolean[] = [];
    const unsubscribe = domainEventBus.subscribe(
      "concept:updated",
      async (event) => {
        if (event.payload.conceptId !== conceptId) return;
        visibility.push(
          (await executeQuery(
            { db: observer.client },
            getGlossaryConceptMaterialization,
            { conceptId },
          )) !== null,
        );
      },
    );
    try {
      await createService().applyChangeSet(changeset.id, { projectId });
      expect(visibility).toEqual([true]);
    } finally {
      unsubscribe();
      await observer.cleanup();
    }
  });

  it("does not publish buffered glossary events when a later changeset entry fails", async () => {
    const { projectId, userId } = await seedTranslationTarget();
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Event rollback glossary ${crypto.randomUUID()}`,
        creatorId: userId,
        projectIds: [projectId],
      },
    );
    const ids = await executeCommand(
      { db: testDb.client },
      reserveGlossaryEntityIds,
      { conceptCount: 1, termCount: 1 },
    );
    const conceptId = assertFirstNonNullish(ids.conceptIds);
    const termId = assertFirstNonNullish(ids.termIds);
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "term_concept",
      entityId: String(conceptId),
      action: "CREATE",
      after: {
        concept: {
          id: conceptId,
          glossaryId: glossary.id,
          creatorId: null,
          definition: "event rollback",
        },
        terms: [
          {
            id: termId,
            termConceptId: conceptId,
            creatorId: userId,
            text: "event",
            languageId: "en",
            type: "NOT_SPECIFIED",
            status: "PREFERRED",
          },
        ],
        subjects: [],
      },
      riskLevel: "MEDIUM",
    });
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId: `invalid-event-${crypto.randomUUID()}`,
      action: "CREATE",
      after: { invalid: true },
      riskLevel: "LOW",
    });
    const observed: number[] = [];
    const unsubscribe = domainEventBus.subscribe("concept:updated", (event) => {
      if (event.payload.conceptId === conceptId) observed.push(conceptId);
    });
    try {
      await expect(
        createService().applyChangeSet(changeset.id, { projectId }),
      ).rejects.toBeInstanceOf(ChangeSetApplicationError);
      expect(observed).toEqual([]);
      await expect(
        executeQuery({ db: testDb.client }, getGlossaryConceptMaterialization, {
          conceptId,
        }),
      ).resolves.toBeNull();
    } finally {
      unsubscribe();
    }
  });

  it("rejects stale glossary application after a direct canonical update", async () => {
    const { projectId, userId } = await seedTranslationTarget();
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `OCC glossary ${crypto.randomUUID()}`,
        creatorId: userId,
        projectIds: [projectId],
      },
    );
    const created = await executeCommand(
      { db: testDb.client },
      createGlossaryTerms,
      {
        glossaryId: glossary.id,
        creatorId: userId,
        data: [
          {
            definition: "before direct write",
            term: "source",
            translation: "target",
            termLanguageId: "en",
            translationLanguageId: "zh-Hans",
          },
        ],
      },
    );
    const conceptId = assertFirstNonNullish(created.conceptIds);
    const before = await executeQuery(
      { db: testDb.client },
      getGlossaryConceptMaterialization,
      { conceptId },
    );
    if (before === null) throw new Error("Expected canonical concept.");
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "term_concept",
      entityId: String(conceptId),
      action: "UPDATE",
      before,
      after: {
        ...before,
        concept: { ...before.concept, definition: "stale branch update" },
      },
      riskLevel: "MEDIUM",
    });
    await executeCommand({ db: testDb.client }, updateGlossaryConcept, {
      conceptId,
      definition: "direct winner",
    });
    await expect(
      createService().applyChangeSet(changeset.id, { projectId }),
    ).rejects.toBeInstanceOf(ChangeSetApplicationError);
    await expect(
      executeQuery({ db: testDb.client }, getGlossaryConceptMaterialization, {
        conceptId,
      }),
    ).resolves.toMatchObject({
      concept: { definition: "direct winner" },
    });
  });

  it("either copies a concurrent append into merge or rejects it after merge", async () => {
    const { projectId, userId } = await seedTranslationTarget();
    const branch = await executeCommand({ db: testDb.client }, createBranch, {
      projectId,
      name: `append-merge-${crypto.randomUUID()}`,
      createdBy: userId,
    });
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, branchId: branch.id, status: "PENDING" },
    );
    const [mergeClient, appendClient] = await Promise.all([
      testDb.openConcurrentClient(),
      testDb.openConcurrentClient(),
    ]);
    const lock = await holdBranchRow(branch.id);
    try {
      const merge = mergeBranch(mergeClient.client, branch.id, userId);
      const append = appendLifecycleEntry(
        appendClient.client,
        branchChangeset.id,
        "991001",
      );
      await lock.release();
      const [merged, appended] = await Promise.all([merge, append]);
      if (appended.status === "APPENDED") {
        expect(merged.success).toBe(true);
        const copied = await executeQuery(
          { db: testDb.client },
          getChangesetEntries,
          { changesetId: merged.mainChangesetId! },
        );
        expect(copied).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ entityId: "991001" }),
          ]),
        );
      } else {
        expect(appended.status).toBe("BRANCH_NOT_ACTIVE");
      }
    } finally {
      await Promise.all([mergeClient.cleanup(), appendClient.cleanup()]);
    }
  });

  it("preserves a concurrent append while rebase holds the lifecycle lock", async () => {
    const { projectId, userId } = await seedTranslationTarget();
    const branch = await executeCommand({ db: testDb.client }, createBranch, {
      projectId,
      name: `append-rebase-${crypto.randomUUID()}`,
      createdBy: userId,
    });
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, branchId: branch.id, status: "PENDING" },
    );
    const [rebaseClient, appendClient] = await Promise.all([
      testDb.openConcurrentClient(),
      testDb.openConcurrentClient(),
    ]);
    const lock = await holdBranchRow(branch.id);
    try {
      const rebase = rebaseBranch(
        rebaseClient.client,
        branch.id,
        getDefaultRegistries().appMethodRegistry,
      );
      const append = appendLifecycleEntry(
        appendClient.client,
        branchChangeset.id,
        "991002",
      );
      await lock.release();
      const [rebased, appended] = await Promise.all([rebase, append]);
      expect(rebased.success).toBe(true);
      expect(appended.status).toBe("APPENDED");
      await expect(
        executeQuery({ db: testDb.client }, getChangesetEntries, {
          changesetId: branchChangeset.id,
        }),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entityId: "991002" }),
        ]),
      );
    } finally {
      await Promise.all([rebaseClient.cleanup(), appendClient.cleanup()]);
    }
  });

  it("persists FAILED state and leaves an invalid changeset unapplied", async () => {
    const { projectId } = await seedTranslationTarget();
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId: `translation:${crypto.randomUUID()}`,
      action: "CREATE",
      after: { text: "missing identity fields" },
      riskLevel: "LOW",
    });

    await expect(
      createService().applyChangeSet(changeset.id, { projectId }),
    ).rejects.toBeInstanceOf(ChangeSetApplicationError);

    await expect(
      executeQuery({ db: testDb.client }, getChangeset, {
        changesetId: changeset.id,
      }),
    ).resolves.toMatchObject({ status: "APPROVED", asyncStatus: "HAS_FAILED" });
    await expect(
      executeQuery({ db: testDb.client }, getChangesetEntries, {
        changesetId: changeset.id,
      }),
    ).resolves.toEqual([expect.objectContaining({ asyncStatus: "FAILED" })]);
  });

  it("builds rollback entries serially in reverse original entry order", async () => {
    const { projectId } = await seedTranslationTarget();
    const original = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId,
      },
    );
    const first = await executeCommand(
      { db: testDb.client },
      addChangesetEntry,
      {
        changesetId: original.id,
        entityType: "translation",
        entityId: `rollback:${crypto.randomUUID()}`,
        action: "CREATE",
        before: null,
        after: { revision: 1 },
        riskLevel: "LOW",
      },
    );
    const second = await executeCommand(
      { db: testDb.client },
      addChangesetEntry,
      {
        changesetId: original.id,
        entityType: "translation",
        entityId: first.entityId,
        action: "UPDATE",
        before: { revision: 1 },
        after: { revision: 2 },
        riskLevel: "LOW",
      },
    );
    const rollback = await createService().rollbackChangeSet(original.id);
    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      {
        changesetId: rollback.id,
      },
    );
    expect(entries.map((entry) => entry.action)).toEqual(["UPDATE", "DELETE"]);
    expect(entries.map((entry) => entry.before)).toEqual([
      second.after,
      first.after,
    ]);
    expect(entries.map((entry) => entry.after)).toEqual([
      second.before,
      first.before,
    ]);
  });

  it("materializes one translation when the same CREATE is retried", async () => {
    const { elementId, projectId, userId } = await seedTranslationTarget();
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    const entityId = `translation:${crypto.randomUUID()}`;
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId,
      action: "CREATE",
      after: {
        translatableElementId: elementId,
        languageId: "zh-Hans",
        text: "Retry-safe translation",
        translatorId: userId,
      },
      riskLevel: "LOW",
    });

    const service = createService();
    await service.applyChangeSet(changeset.id, { projectId });
    await service.applyChangeSet(changeset.id, { projectId });

    await expect(
      executeQuery({ db: testDb.client }, listTranslationsByElement, {
        elementId,
        languageId: "zh-Hans",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        text: "Retry-safe translation",
        meta: { __catVcsEntityId: entityId },
      }),
    ]);
  });

  it("materializes an explicitly identified glossary concept exactly once when a branch merge is retried", async () => {
    const { projectId, userId } = await seedTranslationTarget();
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `VCS glossary ${crypto.randomUUID()}`,
        creatorId: userId,
        projectIds: [projectId],
      },
    );
    const ids = await executeCommand(
      { db: testDb.client },
      reserveGlossaryEntityIds,
      { conceptCount: 1, termCount: 2 },
    );
    const conceptId = assertFirstNonNullish(ids.conceptIds);
    const sourceTermId = assertFirstNonNullish(ids.termIds);
    const targetTermId = ids.termIds[1];
    if (targetTermId === undefined) {
      throw new Error("Expected two reserved glossary term IDs.");
    }
    const branch = await executeCommand({ db: testDb.client }, createBranch, {
      projectId,
      name: `glossary-branch-${crypto.randomUUID()}`,
      createdBy: userId,
    });
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, branchId: branch.id, status: "PENDING" },
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
          definition: "Branch definition",
        },
        subjects: [],
        terms: [
          {
            id: sourceTermId,
            termConceptId: conceptId,
            text: "branch source",
            languageId: "en",
            type: "NOT_SPECIFIED",
            status: "PREFERRED",
            creatorId: userId,
          },
          {
            id: targetTermId,
            termConceptId: conceptId,
            text: "branch target",
            languageId: "zh-Hans",
            type: "NOT_SPECIFIED",
            status: "PREFERRED",
            creatorId: userId,
          },
        ],
      },
      riskLevel: "MEDIUM",
    });

    const merged = await mergeBranch(testDb.client, branch.id, userId);
    expect(merged).toMatchObject({ success: true, hasConflicts: false });

    const service = createService();
    await service.applyChangeSet(merged.mainChangesetId!, { projectId });
    await service.applyChangeSet(merged.mainChangesetId!, { projectId });

    await expect(
      executeQuery({ db: testDb.client }, listGlossaryConcepts, {
        glossaryId: glossary.id,
        pageIndex: 0,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      total: 1,
      data: [
        {
          definition: "Branch definition",
          termCount: 2,
          sampleTerms: expect.arrayContaining([
            expect.objectContaining({
              text: "branch source",
              languageId: "en",
            }),
            expect.objectContaining({
              text: "branch target",
              languageId: "zh-Hans",
            }),
          ]),
        },
      ],
    });
    await expect(
      executeQuery({ db: testDb.client }, getRecallDerivationStates, {
        references: [
          {
            targetKind: "TERM_CONCEPT",
            targetId: String(conceptId),
            languageId: enLanguageId,
            demandRevision: 1,
          },
          {
            targetKind: "TERM_CONCEPT",
            targetId: String(conceptId),
            languageId: zhHansLanguageId,
            demandRevision: 1,
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ demandRevision: 1 }),
      expect.objectContaining({ demandRevision: 1 }),
    ]);

    const rollback = await service.rollbackChangeSet(
      merged.mainChangesetId!,
      userId,
    );
    await service.applyChangeSet(rollback.id, { projectId });
    await expect(
      executeQuery({ db: testDb.client }, listGlossaryConcepts, {
        glossaryId: glossary.id,
        pageIndex: 0,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({ total: 0, data: [] });
  });

  it("rejects a glossary aggregate whose glossary is outside the applying project", async () => {
    const { projectId, userId } = await seedTranslationTarget();
    const otherProject = await executeCommand(
      { db: testDb.client },
      createProject,
      {
        name: `Other glossary project ${crypto.randomUUID()}`,
        description: null,
        creatorId: userId,
      },
    );
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Scoped glossary ${crypto.randomUUID()}`,
        creatorId: userId,
        projectIds: [projectId],
      },
    );
    const ids = await executeCommand(
      { db: testDb.client },
      reserveGlossaryEntityIds,
      { conceptCount: 1, termCount: 1 },
    );
    const conceptId = assertFirstNonNullish(ids.conceptIds);
    const termId = assertFirstNonNullish(ids.termIds);
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId: otherProject.id, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "term_concept",
      entityId: String(conceptId),
      action: "CREATE",
      after: {
        concept: {
          id: conceptId,
          glossaryId: glossary.id,
          creatorId: null,
          definition: "Cross-project glossary",
        },
        terms: [
          {
            id: termId,
            termConceptId: conceptId,
            creatorId: userId,
            text: "cross-project",
            languageId: "en",
            type: "NOT_SPECIFIED",
            status: "PREFERRED",
          },
        ],
        subjects: [],
      },
      riskLevel: "MEDIUM",
    });

    await expect(
      createService().applyChangeSet(changeset.id, {
        projectId: otherProject.id,
      }),
    ).rejects.toBeInstanceOf(ChangeSetApplicationError);
    await expect(
      executeQuery({ db: testDb.client }, listGlossaryConcepts, {
        glossaryId: glossary.id,
        pageIndex: 0,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({ total: 0, data: [] });
  });

  it("rejects a forged DELETE glossary identity without deleting the actual concept", async () => {
    const { projectId: ownerProjectId, userId } = await seedTranslationTarget();
    const applyingProject = await executeCommand(
      { db: testDb.client },
      createProject,
      {
        name: `Forged delete project ${crypto.randomUUID()}`,
        description: null,
        creatorId: userId,
      },
    );
    const [ownerGlossary, applyingGlossary] = await Promise.all([
      executeCommand({ db: testDb.client }, createGlossary, {
        name: `Owner glossary ${crypto.randomUUID()}`,
        creatorId: userId,
        projectIds: [ownerProjectId],
      }),
      executeCommand({ db: testDb.client }, createGlossary, {
        name: `Applying glossary ${crypto.randomUUID()}`,
        creatorId: userId,
        projectIds: [applyingProject.id],
      }),
    ]);
    const created = await executeCommand(
      { db: testDb.client },
      createGlossaryTerms,
      {
        glossaryId: ownerGlossary.id,
        creatorId: userId,
        data: [
          {
            definition: "forged delete",
            term: "source",
            translation: "target",
            termLanguageId: "en",
            translationLanguageId: "zh-Hans",
          },
        ],
      },
    );
    const conceptId = assertFirstNonNullish(created.conceptIds);
    const actual = await executeQuery(
      { db: testDb.client },
      getGlossaryConceptMaterialization,
      { conceptId },
    );
    if (actual === null)
      throw new Error("Expected canonical glossary concept.");
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId: applyingProject.id, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "term_concept",
      entityId: String(conceptId),
      action: "DELETE",
      before: {
        ...actual,
        concept: { ...actual.concept, glossaryId: applyingGlossary.id },
      },
      riskLevel: "MEDIUM",
    });
    await expect(
      createService().applyChangeSet(changeset.id, {
        projectId: applyingProject.id,
      }),
    ).rejects.toBeInstanceOf(ChangeSetApplicationError);
    await expect(
      executeQuery({ db: testDb.client }, getGlossaryConceptMaterialization, {
        conceptId,
      }),
    ).resolves.toEqual(actual);
  });

  it("rejects cross-project Memory Item application and fetch access", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `vcs-memory-scope-${crypto.randomUUID()}@test.local`,
      name: "VCS memory scope tester",
    });
    const ownerProject = await executeCommand(
      { db: testDb.client },
      createProject,
      { name: "Owner project", description: null, creatorId: user.id },
    );
    const otherProject = await executeCommand(
      { db: testDb.client },
      createProject,
      { name: "Other project", description: null, creatorId: user.id },
    );
    const memory = await executeCommand({ db: testDb.client }, createMemory, {
      name: "Scoped VCS memory",
      creatorId: user.id,
      projectIds: [ownerProject.id],
    });
    const [sourceStringId, translationStringId] = await executeCommand(
      { db: testDb.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Scoped source", languageId: "en" },
          { text: "Scoped target", languageId: "zh-Hans" },
        ],
      },
    );
    if (sourceStringId === undefined || translationStringId === undefined) {
      throw new Error("Expected scoped Memory Item strings.");
    }
    const original = (
      await executeCommand({ db: testDb.client }, createMemoryItems, {
        memoryId: memory.id,
        items: [
          {
            translationId: null,
            sourceStringId,
            translationStringId,
            creatorId: user.id,
          },
        ],
      })
    ).items[0]!;
    const payload = {
      memoryItemId: original.id,
      memoryId: memory.id,
      translationId: null,
      sourceStringId,
      translationStringId,
      creatorId: user.id,
    };
    const applicationEntry = (
      action: "CREATE" | "UPDATE" | "DELETE",
      entityId = String(original.id),
    ) => ({
      id: 1,
      changesetId: 1,
      entityType: "memory_item",
      entityId,
      action,
      before: {
        ...payload,
        scope: "PROJECT" as const,
        projectId: otherProject.id,
        deletedById: user.id,
      },
      after: payload,
      fieldPath: null,
      riskLevel: "MEDIUM" as const,
      reviewStatus: "APPROVED" as const,
      asyncStatus: null,
    });
    const readRows = async () =>
      await testDb.client
        .select()
        .from(memoryItem)
        .where(eq(memoryItem.id, original.id));
    const readDemands = async () =>
      await testDb.client
        .select()
        .from(recallDerivationState)
        .where(eq(recallDerivationState.targetId, String(original.id)));
    const rowsBefore = await readRows();
    const demandsBefore = await readDemands();
    const method = new MemoryItemApplicationMethod();
    const ctx = { projectId: otherProject.id, db: testDb.client };

    await expect(
      method.applyCreate(applicationEntry("CREATE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.applyUpdate(applicationEntry("UPDATE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.applyDelete(applicationEntry("DELETE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.fetchCurrentStates([String(original.id)], ctx),
    ).resolves.toEqual(new Map());
    await expect(readRows()).resolves.toEqual(rowsBefore);
    await expect(readDemands()).resolves.toEqual(demandsBefore);
  });

  it("rejects same-project PERSONAL Memory Item application without an actor", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `vcs-personal-scope-${crypto.randomUUID()}@test.local`,
      name: "VCS personal scope tester",
    });
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: "Personal scope project",
      description: null,
      creatorId: user.id,
    });
    const personal = await executeCommand(
      { db: testDb.client },
      ensurePersonalProjectMemory,
      { userId: user.id, projectId: project.id, name: "Personal VCS memory" },
    );
    const [sourceStringId, translationStringId] = await executeCommand(
      { db: testDb.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Personal scoped source", languageId: "en" },
          { text: "Personal scoped target", languageId: "zh-Hans" },
        ],
      },
    );
    if (sourceStringId === undefined || translationStringId === undefined) {
      throw new Error("Expected personal Memory Item strings.");
    }
    const original = (
      await executeCommand({ db: testDb.client }, createMemoryItems, {
        memoryId: personal.memoryId,
        items: [
          {
            translationId: null,
            sourceStringId,
            translationStringId,
            creatorId: user.id,
          },
        ],
      })
    ).items[0]!;
    const payload = {
      memoryItemId: original.id,
      memoryId: personal.memoryId,
      translationId: null,
      sourceStringId,
      translationStringId,
      creatorId: user.id,
    };
    const applicationEntry = (action: "CREATE" | "UPDATE" | "DELETE") => ({
      id: 1,
      changesetId: 1,
      entityType: "memory_item",
      entityId: String(original.id),
      action,
      before: {
        ...payload,
        scope: "PERSONAL" as const,
        projectId: project.id,
        deletedById: user.id,
      },
      after: payload,
      fieldPath: null,
      riskLevel: "MEDIUM" as const,
      reviewStatus: "APPROVED" as const,
      asyncStatus: null,
    });
    const readRows = async () =>
      await testDb.client
        .select()
        .from(memoryItem)
        .where(eq(memoryItem.id, original.id));
    const readDemands = async () =>
      await testDb.client
        .select()
        .from(recallDerivationState)
        .where(eq(recallDerivationState.targetId, String(original.id)));
    const rowsBefore = await readRows();
    const demandsBefore = await readDemands();
    const method = new MemoryItemApplicationMethod();
    const ctx = { projectId: project.id, db: testDb.client };

    await expect(
      method.applyCreate(applicationEntry("CREATE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.applyUpdate(applicationEntry("UPDATE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.applyDelete(applicationEntry("DELETE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.fetchCurrentStates([String(original.id)], ctx),
    ).resolves.toEqual(new Map());
    await expect(readRows()).resolves.toEqual(rowsBefore);
    await expect(readDemands()).resolves.toEqual(demandsBefore);
  });

  it("materializes Memory Item branch merge and rebases canonical snapshots", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `vcs-memory-${crypto.randomUUID()}@test.local`,
      name: "VCS memory tester",
    });
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: "VCS memory project",
      description: null,
      creatorId: user.id,
    });
    const memory = await executeCommand({ db: testDb.client }, createMemory, {
      name: "VCS memory",
      creatorId: user.id,
      projectIds: [project.id],
    });
    const stringIds = await executeCommand(
      { db: testDb.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Save", languageId: "en" },
          { text: "保存", languageId: "zh-Hans" },
          { text: "存储", languageId: "zh-Hans" },
        ],
      },
    );
    const [
      sourceStringId,
      initialTranslationStringId,
      nextTranslationStringId,
    ] = stringIds;
    if (
      sourceStringId === undefined ||
      initialTranslationStringId === undefined ||
      nextTranslationStringId === undefined
    ) {
      throw new Error("Expected Memory Item fixture strings.");
    }
    const existingMemoryItemIds = await testDb.client
      .select({ id: memoryItem.id })
      .from(memoryItem);
    const memoryItemId =
      Math.max(0, ...existingMemoryItemIds.map((item) => item.id)) + 1;
    const createPayload = {
      memoryId: memory.id,
      translationId: null,
      sourceStringId,
      translationStringId: initialTranslationStringId,
      creatorId: user.id,
    };
    const initialPayload = { memoryItemId, ...createPayload };

    const branch = await executeCommand({ db: testDb.client }, createBranch, {
      projectId: project.id,
      name: `memory-branch-${crypto.randomUUID()}`,
      createdBy: user.id,
    });
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId: project.id, branchId: branch.id, status: "PENDING" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: branchChangeset.id,
      entityType: "memory_item",
      entityId: String(memoryItemId),
      action: "CREATE",
      after: createPayload,
      riskLevel: "MEDIUM",
    });

    const merged = await mergeBranch(testDb.client, branch.id, user.id);
    expect(merged).toMatchObject({ success: true, hasConflicts: false });
    await createService().applyChangeSet(merged.mainChangesetId!, {
      projectId: project.id,
    });
    await expect(
      executeQuery({ db: testDb.client }, getMemoryCanonicalSnapshots, {
        memoryItemIds: [memoryItemId],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: memoryItemId, memoryId: memory.id }),
    ]);
    await expect(
      executeQuery({ db: testDb.client }, getRecallDerivationStates, {
        references: [
          {
            targetKind: "MEMORY_ITEM",
            targetId: String(memoryItemId),
            languageId: enLanguageId,
            demandRevision: 1,
          },
          {
            targetKind: "MEMORY_ITEM",
            targetId: String(memoryItemId),
            languageId: zhHansLanguageId,
            demandRevision: 1,
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ demandRevision: 1 }),
      expect.objectContaining({ demandRevision: 1 }),
    ]);

    const ordinary = await executeCommand(
      { db: testDb.client },
      createMemoryItems,
      {
        memoryId: memory.id,
        items: [
          {
            translationId: null,
            sourceStringId,
            translationStringId: nextTranslationStringId,
            creatorId: user.id,
          },
        ],
      },
    );
    expect(ordinary.items[0]?.id).toBeGreaterThan(memoryItemId);

    const rebaseBranchRow = await executeCommand(
      { db: testDb.client },
      createBranch,
      {
        projectId: project.id,
        name: `memory-rebase-${crypto.randomUUID()}`,
        createdBy: user.id,
      },
    );
    const rebaseChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId: project.id,
        branchId: rebaseBranchRow.id,
        status: "PENDING",
      },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: rebaseChangeset.id,
      entityType: "memory_item",
      entityId: String(memoryItemId),
      action: "UPDATE",
      before: initialPayload,
      after: {
        ...initialPayload,
        translationStringId: nextTranslationStringId,
      },
      riskLevel: "MEDIUM",
    });

    const mainChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId: project.id, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: mainChangeset.id,
      entityType: "memory_item",
      entityId: String(memoryItemId),
      action: "UPDATE",
      before: initialPayload,
      after: {
        ...initialPayload,
        translationStringId: nextTranslationStringId,
      },
      riskLevel: "MEDIUM",
    });
    await createService().applyChangeSet(mainChangeset.id, {
      projectId: project.id,
    });

    await rebaseBranch(
      testDb.client,
      rebaseBranchRow.id,
      getDefaultRegistries().appMethodRegistry,
    );
    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      { changesetId: rebaseChangeset.id },
    );
    expect(entries[0]?.before).toMatchObject({
      memoryItemId,
      translationStringId: nextTranslationStringId,
    });
    await expect(
      executeQuery({ db: testDb.client }, getRecallDerivationStates, {
        references: [
          {
            targetKind: "MEMORY_ITEM",
            targetId: String(memoryItemId),
            languageId: enLanguageId,
            demandRevision: 2,
          },
          {
            targetKind: "MEMORY_ITEM",
            targetId: String(memoryItemId),
            languageId: zhHansLanguageId,
            demandRevision: 2,
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ demandRevision: 2 }),
      expect.objectContaining({ demandRevision: 2 }),
    ]);
  });
});
